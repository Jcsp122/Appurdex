import crypto from "node:crypto";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { ALERT_CHANGE_TYPES, normalizeAlertTypes } from "./change-types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultDataDir = path.join(rootDir, "data");

function dataDir() {
  return path.resolve(process.env.APPURDEX_DATA_DIR || defaultDataDir);
}

function defaultDbPath() {
  return path.join(dataDir(), "appurdex-auth.sqlite");
}

let database = null;

function now() {
  return new Date().toISOString();
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function apiUsageWindow(reference = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0));
  const reset = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { windowStartAt: start.toISOString(), resetAt: reset.toISOString() };
}

function dbPath() {
  return process.env.APPURDEX_DB_PATH || defaultDbPath();
}

function openDb() {
  if (database) return database;
  fsSync.mkdirSync(path.dirname(dbPath()), { recursive: true });
  database = new DatabaseSync(dbPath());
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  migrate(database);
  return database;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'free',
      plan_id TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      profile_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_account_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      price_id TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      token_preview TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id TEXT PRIMARY KEY,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route TEXT NOT NULL,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_sync_state (
      slug TEXT PRIMARY KEY,
      sync_tier TEXT NOT NULL DEFAULT 'long_tail',
      next_sync_at TEXT,
      last_synced_at TEXT,
      etag TEXT,
      last_error TEXT,
      request_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      query TEXT NOT NULL,
      parser_source TEXT NOT NULL,
      filters_json TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      agent_slugs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_comparisons (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'products',
      slugs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target_url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      response_status INTEGER,
      response_body TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      agent_slug TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const watchlistColumns = new Set(db.prepare("PRAGMA table_info(watchlists)").all().map((column) => column.name));
  if (!watchlistColumns.has("alert_types_json")) {
    db.exec("ALTER TABLE watchlists ADD COLUMN alert_types_json TEXT NOT NULL DEFAULT '{}'");
  }
  ensureColumn(db, "users", "username", "TEXT");
  backfillUsernames(db);
}

function tableColumns(db, tableName) {
  return db.prepare("PRAGMA table_info(" + tableName + ")").all().map((row) => row.name);
}

function ensureColumn(db, tableName, columnName, definition) {
  if (tableColumns(db, tableName).includes(columnName)) return;
  db.exec("ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + definition);
}

function usernameExists(db, username, exceptUserId = null) {
  const row = exceptUserId
    ? db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(username, exceptUserId)
    : db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  return Boolean(row);
}

function randomUsername(db, exceptUserId = null) {
  for (let index = 0; index < 12; index += 1) {
    const username = "appur-" + crypto.randomBytes(3).toString("hex");
    if (!usernameExists(db, username, exceptUserId)) return username;
  }
  return "appur-" + crypto.randomUUID().slice(0, 8);
}

function backfillUsernames(db) {
  const rows = db.prepare("SELECT id, username FROM users").all();
  const update = db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?");
  rows.forEach((row) => {
    if (row.username) return;
    update.run(randomUsername(db, row.id), now(), row.id);
  });
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function effectivePlan(user) {
  if (!user) return "free";
  if (user.role === "admin") return "admin";
  if (user.role === "enterprise") return "enterprise";
  if (user.role === "starter") return "starter";
  if (user.role === "pro") return "pro";
  if (["active", "trialing"].includes(user.subscription_status) && ["starter", "pro", "enterprise"].includes(user.plan_id)) return user.plan_id;
  return "free";
}

export function hasAccess(user, featureFlag) {
  const plan = effectivePlan(user);
  if (plan === "admin") return true;
  const rules = {
    viewOverview: ["free", "starter", "pro", "enterprise"],
    viewVendorDetail: ["free", "starter", "pro", "enterprise"],
    compareProducts: ["free", "starter", "pro", "enterprise"],
    compareProductsUnlimited: ["starter", "pro", "enterprise"],
    sourceBackedPricing: ["starter", "pro", "enterprise"],
    dataConfidence: ["starter", "pro", "enterprise"],
    usageDashboard: ["free", "starter", "pro", "enterprise"],
    priorityFreshness: [],
    historicalTrends: ["pro", "enterprise"],
    csvExport: ["pro", "enterprise"],
    apiAccess: ["starter", "pro", "enterprise"],
    alerts: ["pro", "enterprise"],
    watchlists: ["starter", "pro", "enterprise"],
    savedComparisons: ["starter", "pro", "enterprise"],
    webhooks: ["pro", "enterprise"],
    appurScore: ["pro", "enterprise"],
    bulkApiExport: ["enterprise"],
    whiteLabelReports: ["enterprise"],
    verifiedBadgeRequest: ["enterprise"],
  };
  return (rules[featureFlag] || []).includes(plan);
}

export function getPlanLimits(user) {
  const plan = effectivePlan(user);
  if (plan === "admin") return { plan, apiMonthlyLimit: null, compareLimit: null, apiLimitConfigured: false, freshnessTier: "default", exportTier: "admin" };
  if (plan === "enterprise") return { plan, apiMonthlyLimit: process.env.APPURDEX_ENTERPRISE_API_MONTHLY_LIMIT ? numberEnv("APPURDEX_ENTERPRISE_API_MONTHLY_LIMIT", null) : null, compareLimit: null, apiLimitConfigured: Boolean(process.env.APPURDEX_ENTERPRISE_API_MONTHLY_LIMIT), freshnessTier: "default", exportTier: "commercial" };
  if (plan === "pro") return { plan, apiMonthlyLimit: numberEnv("APPURDEX_PRO_API_MONTHLY_LIMIT", 50000), compareLimit: null, apiLimitConfigured: true, freshnessTier: "default", exportTier: "csv" };
  if (plan === "starter") return { plan, apiMonthlyLimit: numberEnv("APPURDEX_STARTER_API_MONTHLY_LIMIT", 5000), compareLimit: null, apiLimitConfigured: true, freshnessTier: "default", exportTier: "none" };
  return { plan: "free", apiMonthlyLimit: 0, compareLimit: 2, apiLimitConfigured: false, freshnessTier: "default", exportTier: "none" };
}

export function getApiUsageSummary(user) {
  const limits = getPlanLimits(user);
  const { windowStartAt, resetAt } = apiUsageWindow();
  if (!user?.id) return { plan: limits.plan, used: 0, limit: limits.apiMonthlyLimit, remaining: limits.apiMonthlyLimit, windowStartAt, resetAt, apiLimitConfigured: limits.apiLimitConfigured };
  const db = openDb();
  const row = db.prepare("SELECT COUNT(*) AS count FROM api_usage WHERE user_id = ? AND used_at >= ? AND used_at < ?").get(user.id, windowStartAt, resetAt);
  const used = Number(row?.count || 0);
  const limit = Number.isFinite(limits.apiMonthlyLimit) ? limits.apiMonthlyLimit : null;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  return { plan: limits.plan, used, limit, remaining, windowStartAt, resetAt, apiLimitConfigured: limits.apiLimitConfigured, overLimit: limit !== null && used >= limit };
}
export function findUserByEmail(email) {
  const db = openDb();
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) || null;
}

export function getUserById(id) {
  const db = openDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

export function getUserByStripeCustomerId(customerId) {
  const db = openDb();
  return db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").get(customerId) || null;
}

export function upsertUserByEmail(email, fields = {}) {
  const db = openDb();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email is required.");
  const existing = findUserByEmail(normalizedEmail);
  const timestamp = now();
  if (!existing) {
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      username: fields.username || randomUsername(db),
      role: fields.role || "free",
      stripe_customer_id: fields.stripe_customer_id || null,
      stripe_subscription_id: fields.stripe_subscription_id || null,
      subscription_status: fields.subscription_status || "free",
      plan_id: fields.plan_id || "free",
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.prepare(`
      INSERT INTO users (id, email, username, role, stripe_customer_id, stripe_subscription_id, subscription_status, plan_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, user.email, user.username, user.role, user.stripe_customer_id, user.stripe_subscription_id, user.subscription_status, user.plan_id, user.created_at, user.updated_at);
    return user;
  }

  const next = {
    ...existing,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    updated_at: timestamp,
  };
  db.prepare(`
    UPDATE users
    SET username = ?, role = ?, stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, plan_id = ?, updated_at = ?
    WHERE id = ?
  `).run(next.username || randomUsername(db, next.id), next.role, next.stripe_customer_id, next.stripe_subscription_id, next.subscription_status, next.plan_id, next.updated_at, next.id);
  return getUserById(existing.id);
}

export function updateUserStripeFields(userId, fields) {
  const db = openDb();
  const existing = getUserById(userId);
  if (!existing) return null;
  const next = { ...existing, ...fields, updated_at: now() };
  db.prepare(`
    UPDATE users
    SET username = ?, role = ?, stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, plan_id = ?, updated_at = ?
    WHERE id = ?
  `).run(next.username || randomUsername(db, userId), next.role, next.stripe_customer_id, next.stripe_subscription_id, next.subscription_status, next.plan_id, next.updated_at, userId);
  return getUserById(userId);
}

export function createSession(userId, maxAgeDays = 30) {
  const db = openDb();
  const id = crypto.randomBytes(32).toString("base64url");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + maxAgeDays * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(id, userId, expiresAt, createdAt);
  return { id, userId, expiresAt, createdAt };
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const db = openDb();
  const row = db.prepare(`
    SELECT sessions.id AS session_id, sessions.expires_at, users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
  `).get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }
  return {
    session: { id: row.session_id, expiresAt: row.expires_at },
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      subscription_status: row.subscription_status,
      plan_id: row.plan_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

export function deleteSession(sessionId) {
  const db = openDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function createMagicLink(email, tokenHash, expiresAt) {
  const db = openDb();
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO magic_links (id, email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(id, normalizeEmail(email), tokenHash, expiresAt, now());
  return { id, email: normalizeEmail(email), expiresAt };
}

export function consumeMagicLink(tokenHash) {
  const db = openDb();
  const row = db.prepare("SELECT * FROM magic_links WHERE token_hash = ?").get(tokenHash);
  if (!row) return { ok: false, error: "Magic link not found." };
  if (row.consumed_at) return { ok: false, error: "Magic link was already used." };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, error: "Magic link expired." };
  db.prepare("UPDATE magic_links SET consumed_at = ? WHERE id = ?").run(now(), row.id);
  return { ok: true, email: row.email };
}

export function upsertOAuthAccount({ provider, providerAccountId, email, profile }) {
  const db = openDb();
  const user = upsertUserByEmail(email);
  const existing = db.prepare("SELECT * FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?").get(provider, providerAccountId);
  const timestamp = now();
  if (existing) {
    db.prepare("UPDATE oauth_accounts SET user_id = ?, email = ?, profile_json = ?, updated_at = ? WHERE id = ?")
      .run(user.id, normalizeEmail(email), JSON.stringify(profile || {}), timestamp, existing.id);
  } else {
    db.prepare(`
      INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, email, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), user.id, provider, providerAccountId, normalizeEmail(email), JSON.stringify(profile || {}), timestamp, timestamp);
  }
  return getUserById(user.id);
}

export function upsertSubscriptionFromStripe({ userId, stripeCustomerId, stripeSubscriptionId, status, planId, priceId, currentPeriodEnd, cancelAtPeriodEnd }) {
  const db = openDb();
  const existing = db.prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?").get(stripeSubscriptionId);
  const timestamp = now();
  if (existing) {
    db.prepare(`
      UPDATE subscriptions
      SET user_id = ?, stripe_customer_id = ?, status = ?, plan_id = ?, price_id = ?, current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
      WHERE stripe_subscription_id = ?
    `).run(userId, stripeCustomerId, status, planId, priceId, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, timestamp, stripeSubscriptionId);
  } else {
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, plan_id, price_id, current_period_end, cancel_at_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userId, stripeCustomerId, stripeSubscriptionId, status, planId, priceId, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, timestamp);
  }
  const effectiveRole = ["active", "trialing"].includes(status) ? planId : "free";
  const effectiveUserRole = ["starter", "pro", "enterprise"].includes(effectiveRole) ? effectiveRole : "free";
  return updateUserStripeFields(userId, {
    role: effectiveUserRole,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_status: status,
    plan_id: effectiveRole,
  });
}

export function createCustomerApiKey({ userId, name = "Appurdex API key" }) {
  const db = openDb();
  const token = `appx_${crypto.randomBytes(24).toString("hex")}`;
  const tokenPreview = `${token.slice(0, 8)}...${token.slice(-4)}`;
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO api_keys (id, user_id, token_hash, token_preview, name, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(id, userId, hashToken(token), tokenPreview, name, now());
  return { id, token, tokenPreview, name, status: "active" };
}

export function findCustomerApiKey(token) {
  const db = openDb();
  const row = db.prepare(`
    SELECT api_keys.*, users.email, users.username, users.role, users.subscription_status, users.plan_id
    FROM api_keys
    JOIN users ON users.id = api_keys.user_id
    WHERE api_keys.token_hash = ? AND api_keys.status = 'active'
  `).get(hashToken(token));
  if (!row) return null;
  return {
    key: { id: row.id, userId: row.user_id, name: row.name, tokenPreview: row.token_preview },
    user: {
      id: row.user_id,
      email: row.email,
      username: row.username,
      role: row.role,
      subscription_status: row.subscription_status,
      plan_id: row.plan_id,
    },
  };
}

export function recordApiUsage({ apiKeyId, userId, route }) {
  const db = openDb();
  const timestamp = now();
  db.prepare("INSERT INTO api_usage (id, api_key_id, user_id, route, used_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), apiKeyId, userId, route, timestamp);
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(timestamp, apiKeyId);
  return getApiUsageSummary(getUserById(userId));
}

export function getSyncStates() {
  const db = openDb();
  return db.prepare("SELECT * FROM agent_sync_state").all();
}

export function getSyncState(slug) {
  const db = openDb();
  return db.prepare("SELECT * FROM agent_sync_state WHERE slug = ?").get(slug) || null;
}

export function upsertSyncState(slug, fields = {}) {
  const db = openDb();
  const existing = getSyncState(slug);
  const timestamp = now();
  const next = {
    slug,
    sync_tier: fields.syncTier || fields.sync_tier || existing?.sync_tier || "long_tail",
    next_sync_at: fields.nextSyncAt ?? fields.next_sync_at ?? existing?.next_sync_at ?? null,
    last_synced_at: fields.lastSyncedAt ?? fields.last_synced_at ?? existing?.last_synced_at ?? null,
    etag: fields.etag ?? existing?.etag ?? null,
    last_error: fields.lastError ?? fields.last_error ?? null,
    request_count: Number(fields.requestCount ?? fields.request_count ?? existing?.request_count ?? 0),
    updated_at: timestamp,
  };
  if (existing) {
    db.prepare(`
      UPDATE agent_sync_state
      SET sync_tier = ?, next_sync_at = ?, last_synced_at = ?, etag = ?, last_error = ?, request_count = ?, updated_at = ?
      WHERE slug = ?
    `).run(next.sync_tier, next.next_sync_at, next.last_synced_at, next.etag, next.last_error, next.request_count, next.updated_at, slug);
  } else {
    db.prepare(`
      INSERT INTO agent_sync_state (slug, sync_tier, next_sync_at, last_synced_at, etag, last_error, request_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(slug, next.sync_tier, next.next_sync_at, next.last_synced_at, next.etag, next.last_error, next.request_count, next.updated_at);
  }
  return getSyncState(slug);
}
function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function serializeList(value) {
  return JSON.stringify(Array.isArray(value) ? value.filter(Boolean).map(String) : []);
}

function normalizeWatchlistItems({ agentSlugs = [], items = [], alertTypes = ALERT_CHANGE_TYPES } = {}) {
  const byProduct = new Map();
  const defaultTypes = normalizeAlertTypes(alertTypes);
  for (const slug of agentSlugs || []) {
    const productId = String(slug || "").trim();
    if (productId) byProduct.set(productId, defaultTypes);
  }
  for (const item of items || []) {
    const productId = String(item?.productId || item?.agentSlug || "").trim();
    if (!productId) continue;
    byProduct.set(productId, normalizeAlertTypes(item.alertTypes, defaultTypes));
  }
  return [...byProduct.entries()].map(([productId, itemAlertTypes]) => ({ productId, alertTypes: itemAlertTypes }));
}

function alertTypeMapForItems(items) {
  return Object.fromEntries(normalizeWatchlistItems({ items }).map((item) => [item.productId, item.alertTypes]));
}

function itemsFromRow(row) {
  const agentSlugs = parseJson(row.agent_slugs_json, []);
  const alertTypeMap = parseJson(row.alert_types_json, {});
  return agentSlugs.map((productId) => ({
    productId,
    alertTypes: normalizeAlertTypes(alertTypeMap?.[productId], ALERT_CHANGE_TYPES),
  }));
}
export function recordSearchLog({ userId = null, query, parserSource, filters, resultCount = 0 }) {
  const db = openDb();
  const item = {
    id: crypto.randomUUID(),
    user_id: userId || null,
    query: String(query || "").slice(0, 1000),
    parser_source: parserSource || "rules",
    filters_json: JSON.stringify(filters || {}),
    result_count: Number(resultCount || 0),
    created_at: now(),
  };
  db.prepare(`
    INSERT INTO search_logs (id, user_id, query, parser_source, filters_json, result_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.user_id, item.query, item.parser_source, item.filters_json, item.result_count, item.created_at);
  return item;
}

export function listWatchlists(userId) {
  const db = openDb();
  return db.prepare("SELECT * FROM watchlists WHERE user_id = ? ORDER BY updated_at DESC").all(userId).map((row) => {
    const items = itemsFromRow(row);
    return {
      id: row.id,
      name: row.name,
      items,
      agentSlugs: items.map((item) => item.productId),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function createWatchlist({ userId, name = "Watchlist", agentSlugs = [], items = [], alertTypes = ALERT_CHANGE_TYPES }) {
  const db = openDb();
  const timestamp = now();
  const watchItems = normalizeWatchlistItems({ agentSlugs, items, alertTypes });
  const item = { id: crypto.randomUUID(), userId, name: String(name || "Watchlist").slice(0, 120), items: watchItems, agentSlugs: watchItems.map((entry) => entry.productId) };
  db.prepare(`
    INSERT INTO watchlists (id, user_id, name, agent_slugs_json, alert_types_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, userId, item.name, serializeList(item.agentSlugs), JSON.stringify(alertTypeMapForItems(watchItems)), timestamp, timestamp);
  return { ...item, createdAt: timestamp, updatedAt: timestamp };
}

export function deleteWatchlist({ userId, id }) {
  const db = openDb();
  const result = db.prepare("DELETE FROM watchlists WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

export function listSavedComparisons(userId) {
  const db = openDb();
  return db.prepare("SELECT * FROM saved_comparisons WHERE user_id = ? ORDER BY updated_at DESC").all(userId).map((row) => ({
    id: row.id,
    name: row.name,
    mode: row.mode,
    slugs: parseJson(row.slugs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function createSavedComparison({ userId, name = "Saved comparison", mode = "products", slugs = [] }) {
  const db = openDb();
  const timestamp = now();
  const safeMode = ["products", "vendors", "models"].includes(mode) ? mode : "products";
  const item = { id: crypto.randomUUID(), userId, name: String(name || "Saved comparison").slice(0, 120), mode: safeMode, slugs };
  db.prepare(`
    INSERT INTO saved_comparisons (id, user_id, name, mode, slugs_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, userId, item.name, item.mode, serializeList(slugs), timestamp, timestamp);
  return { ...item, createdAt: timestamp, updatedAt: timestamp };
}

export function deleteSavedComparison({ userId, id }) {
  const db = openDb();
  const result = db.prepare("DELETE FROM saved_comparisons WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}

function serializeWebhook(row, includeSecret = false) {
  return {
    id: row.id,
    name: row.name,
    targetUrl: row.target_url,
    events: parseJson(row.events_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeSecret ? { secret: row.secret } : {}),
  };
}

export function listWebhookEndpoints(userId) {
  const db = openDb();
  return db.prepare("SELECT * FROM webhook_endpoints WHERE user_id = ? AND status != 'deleted' ORDER BY updated_at DESC").all(userId).map((row) => serializeWebhook(row));
}

export function getWebhookEndpointForUser({ userId, id, includeSecret = false }) {
  const db = openDb();
  const row = db.prepare("SELECT * FROM webhook_endpoints WHERE user_id = ? AND id = ? AND status != 'deleted'").get(userId, id);
  return row ? serializeWebhook(row, includeSecret) : null;
}
export function createWebhookEndpoint({ userId, name = "Appurdex webhook", targetUrl, events = [] }) {
  const db = openDb();
  const parsed = new URL(String(targetUrl || ""));
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Webhook URL must be HTTP or HTTPS.");
  const timestamp = now();
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const id = crypto.randomUUID();
  const safeEvents = Array.isArray(events) && events.length ? events.map(String) : ["pricing.changed", "access.changed", "tool.added", "freshness.changed"];
  db.prepare(`
    INSERT INTO webhook_endpoints (id, user_id, name, target_url, secret, events_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, userId, String(name || "Appurdex webhook").slice(0, 120), parsed.toString(), secret, JSON.stringify(safeEvents), timestamp, timestamp);
  return serializeWebhook(db.prepare("SELECT * FROM webhook_endpoints WHERE id = ?").get(id), true);
}

export function deleteWebhookEndpoint({ userId, id }) {
  const db = openDb();
  const result = db.prepare("UPDATE webhook_endpoints SET status = 'deleted', updated_at = ? WHERE user_id = ? AND id = ?").run(now(), userId, id);
  return result.changes > 0;
}

export function activeWebhookEndpointsForEvent(eventType) {
  const db = openDb();
  return db.prepare("SELECT * FROM webhook_endpoints WHERE status = 'active'").all().map((row) => serializeWebhook(row, true)).filter((endpoint) => {
    return !endpoint.events.length || endpoint.events.includes(eventType);
  });
}

export function recordWebhookDelivery({ webhookId, eventType, payload, status = "pending", attemptCount = 0, responseStatus = null, responseBody = "", nextAttemptAt = null }) {
  const db = openDb();
  const timestamp = now();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload_json, status, attempt_count, next_attempt_at, last_attempt_at, response_status, response_body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, webhookId, eventType, JSON.stringify(payload || {}), status, attemptCount, nextAttemptAt, attemptCount > 0 ? timestamp : null, responseStatus, String(responseBody || "").slice(0, 1000), timestamp, timestamp);
  return { id, webhookId, eventType, status, attemptCount, responseStatus, createdAt: timestamp, updatedAt: timestamp };
}

export function updateWebhookDelivery(id, fields = {}) {
  const db = openDb();
  const existing = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(id);
  if (!existing) return null;
  const next = {
    status: fields.status || existing.status,
    attempt_count: Number(fields.attemptCount ?? fields.attempt_count ?? existing.attempt_count),
    next_attempt_at: fields.nextAttemptAt ?? fields.next_attempt_at ?? existing.next_attempt_at,
    last_attempt_at: fields.lastAttemptAt ?? fields.last_attempt_at ?? existing.last_attempt_at,
    response_status: fields.responseStatus ?? fields.response_status ?? existing.response_status,
    response_body: String(fields.responseBody ?? fields.response_body ?? existing.response_body ?? "").slice(0, 1000),
    updated_at: now(),
  };
  db.prepare(`
    UPDATE webhook_deliveries
    SET status = ?, attempt_count = ?, next_attempt_at = ?, last_attempt_at = ?, response_status = ?, response_body = ?, updated_at = ?
    WHERE id = ?
  `).run(next.status, next.attempt_count, next.next_attempt_at, next.last_attempt_at, next.response_status, next.response_body, next.updated_at, id);
  return { id, status: next.status, attemptCount: next.attempt_count, responseStatus: next.response_status, updatedAt: next.updated_at };
}

export function listWebhookDeliveries({ userId, webhookId = null }) {
  const db = openDb();
  const rows = webhookId
    ? db.prepare(`
      SELECT webhook_deliveries.* FROM webhook_deliveries
      JOIN webhook_endpoints ON webhook_endpoints.id = webhook_deliveries.webhook_id
      WHERE webhook_endpoints.user_id = ? AND webhook_endpoints.id = ?
      ORDER BY webhook_deliveries.created_at DESC LIMIT 100
    `).all(userId, webhookId)
    : db.prepare(`
      SELECT webhook_deliveries.* FROM webhook_deliveries
      JOIN webhook_endpoints ON webhook_endpoints.id = webhook_deliveries.webhook_id
      WHERE webhook_endpoints.user_id = ?
      ORDER BY webhook_deliveries.created_at DESC LIMIT 100
    `).all(userId);
  return rows.map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: parseJson(row.payload_json, {}),
    status: row.status,
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function recordNotificationEvent({ userId = null, eventType, agentSlug = null, payload = {} }) {
  const db = openDb();
  const timestamp = now();
  const item = { id: crypto.randomUUID(), userId, eventType, agentSlug, payload, createdAt: timestamp };
  db.prepare(`
    INSERT INTO notification_events (id, user_id, event_type, agent_slug, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(item.id, userId, eventType, agentSlug, JSON.stringify(payload), timestamp);
  return item;
}

export function listNotificationEventsSince(sinceIso) {
  const db = openDb();
  const since = sinceIso || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare("SELECT * FROM notification_events WHERE created_at >= ? ORDER BY created_at DESC").all(since).map((row) => ({
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    agentSlug: row.agent_slug,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
  }));
}

export function listDigestUsers() {
  const db = openDb();
  return db.prepare(`
    SELECT DISTINCT users.* FROM users
    JOIN watchlists ON watchlists.user_id = users.id
    WHERE users.plan_id IN ('pro', 'enterprise') OR users.role IN ('admin', 'pro', 'enterprise')
    ORDER BY users.email ASC
  `).all().map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    subscription_status: row.subscription_status,
    plan_id: row.plan_id,
  }));
}









