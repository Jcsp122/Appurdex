import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiKeyRecord, findAgent, maskApiKey, publicAgent, publicModelPricingEntry, readDb, refreshFreshnessScores, requireApiKey, writeDb, makeReviewItem } from "./store.mjs";
import { authenticateCustomerApiKey, authConfig, handleAuthBillingRoute, requestSession } from "./auth-billing.mjs";
import {
  activeWebhookEndpointsForEvent,
  createSavedComparison,
  createWatchlist,
  createWebhookEndpoint,
  deleteSavedComparison,
  deleteWatchlist,
  deleteWebhookEndpoint,
  effectivePlan,
  hasAccess,
  getWebhookEndpointForUser,
  listDigestUsers,
  listNotificationEventsSince,
  listSavedComparisons,
  listWatchlists,
  listWebhookDeliveries,
  listWebhookEndpoints,
  recordNotificationEvent,
  recordSearchLog,
  recordWebhookDelivery,
  updateWebhookDelivery,
} from "./customer-store.mjs";
import { buildSourceUrls } from '../src/lib/agentModel.js';
import { changeTypeForReviewItem, eventTypeForChangeType, normalizeAlertTypes } from "./change-types.mjs";
import { buildWeeklyDigest, sendWeeklyDigestEmail } from "./digest.mjs";
import { runWorker } from "./worker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function loadLocalEnv(filePath = path.join(rootDir, ".env.local")) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadLocalEnv();

const port = Number(process.env.PORT || 8791);

function json(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": response.req?.headers.origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, stripe-signature, x-appurdex-api-key, X-Appurdex-Api-Key, X-Appurdex-Key, x-appurdex-cron-secret",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    ...extraHeaders,
  });
  response.end(payload);
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readRawBody(request);
  if (body.length === 0) return {};
  return JSON.parse(body.toString("utf8"));
}

function publicState(db) {
  return {
    agents: db.agents.map((agent) => publicAgent(agent, db)),
    sourceChecks: db.sourceChecks,
    githubMetrics: db.githubMetrics,
    apiPlans: db.apiPlans,
    freeDataSources: db.freeDataSources || [],
    fieldDataPolicies: db.fieldDataPolicies || {},
    workerRuns: db.workerRuns.slice(0, 3),
    metricSnapshots: (db.metricSnapshots || []).slice(0, 100),
    modelPricing: (db.modelPricing || []).map((entry) => publicModelPricingEntry(entry, db)),
    modelPricingSources: db.modelPricingSources || [],
    modelPricingSourceChecks: db.modelPricingSourceChecks || {},
    alerts: (db.reviewQueue || []).filter((item) => publicAlertTypes.has(item.type)).map(publicChangeAlert),
    apiVersion: API_VERSION,
    freshnessComputedAt: db.freshnessComputedAt || null,
  };
}

function adminState(db) {
  return {
    ...publicState(db),
    reviewQueue: db.reviewQueue,
    suggestions: db.suggestions,
    vendorClaims: db.vendorClaims,
    apiKeys: db.apiKeys.map(maskApiKey),
  };
}

const publicAlertTypes = new Set([
  "source_changed",
  "source_check_failed",
  "model_pricing_source_changed",
  "model_pricing_source_check_failed",
  "automation_gap",
  "pricing_changed",
  "access_changed",
  "model_support_changed",
  "tool_added",
  "freshness_changed",
]);

function publicChangeAlert(item) {
  const changeType = changeTypeForReviewItem(item);
  return {
    id: item.id,
    type: item.type,
    changeType,
    productId: item.agentSlug,
    agentSlug: item.agentSlug,
    field: item.field || item.type,
    oldValue: item.oldValue ?? null,
    newValue: item.newValue ?? item.detail ?? item.title ?? null,
    detectedAt: item.detectedAt || item.updatedAt || item.createdAt || null,
    title: item.title,
    detail: item.detail,
    sourceUrl: item.sourceUrl || null,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicPricing(agent, db) {
  const item = publicAgent(agent, db);
  return {
    slug: item.slug,
    name: item.name,
    category: item.category,
    ecosystem: item.ecosystem,
    pricingTier: item.pricingTier,
    pricingType: item.pricingType,
    pricingSummary: item.pricingSummary,
    price: item.price,
    pricing: item.pricing,
    pricingPlans: item.pricingPlans || [],
    pricingSources: (item.sourceUrls || []).filter((source) => source.kind === "pricing"),
  modelPricingRefs: item.modelPricingRefs || [],
    modelPricingSourceRefs: item.modelPricingSourceRefs || [],
    modelPricingCoverage: item.modelPricingCoverage || "unknown",
  };
}

function authorizedCronRequest(request) {
  const configuredSecret = process.env.APPURDEX_CRON_SECRET || process.env.CRON_SECRET || "";
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers["x-appurdex-cron-secret"];
  if (configuredSecret) return bearer === configuredSecret || headerSecret === configuredSecret;

  return request.headers["user-agent"] === "vercel-cron/1.0" && Boolean(request.headers["x-vercel-cron-schedule"]);
}

async function githubDiagnostics() {
  const token = process.env.GITHUB_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AppurdexResearchWorker/0.1",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const result = {
    tokenConfigured: Boolean(token),
    tokenLength: token.length,
    rateLimit: null,
    repoProbe: null,
  };

  try {
    const rateResponse = await fetch("https://api.github.com/rate_limit", { headers });
    const rateBody = await rateResponse.json().catch(() => ({}));
    result.rateLimit = {
      status: rateResponse.status,
      limit: rateBody.resources?.core?.limit ?? null,
      remaining: rateBody.resources?.core?.remaining ?? null,
      resetAt: rateBody.resources?.core?.reset ? new Date(rateBody.resources.core.reset * 1000).toISOString() : null,
      message: rateBody.message || null,
    };
  } catch (error) {
    result.rateLimit = { status: null, message: error.message };
  }

  try {
    const repoResponse = await fetch("https://api.github.com/repos/openai/codex", { headers });
    const repoBody = await repoResponse.json().catch(() => ({}));
    result.repoProbe = {
      status: repoResponse.status,
      ok: repoResponse.ok,
      message: repoBody.message || null,
      stars: repoBody.stargazers_count ?? null,
      rateRemaining: repoResponse.headers.get("x-ratelimit-remaining"),
      rateResetAt: repoResponse.headers.get("x-ratelimit-reset") ? new Date(Number(repoResponse.headers.get("x-ratelimit-reset")) * 1000).toISOString() : null,
    };
  } catch (error) {
    result.repoProbe = { status: null, ok: false, message: error.message };
  }

  return result;
}
function healthState() {
  const config = authConfig();
  const authDbPath = process.env.APPURDEX_DB_PATH || path.join(rootDir, "data", "appurdex-auth.sqlite");
  return {
    ok: true,
    service: "appurdex",
    backend: "ready",
    auth: {
      emailMagicLink: config.emailMagicLink,
      google: config.google,
      apple: config.apple,
      enabled: config.enabled,
      missingEnv: config.missingEnv,
    },
    billing: {
      stripe: config.stripe,
      enabled: config.enabled.billing,
      missingEnv: config.missingEnv.stripe,
    },
    storage: {
      sqlite: true,
      appurdexDbPathConfigured: Boolean(process.env.APPURDEX_DB_PATH),
      directoryExists: fsSync.existsSync(path.dirname(authDbPath)),
      databaseFileExists: fsSync.existsSync(authDbPath),
    },
  };
}

const API_VERSION = "2026-07-07";
const starterPlans = new Set(["starter", "pro", "enterprise", "admin"]);
const proPlans = new Set(["pro", "enterprise", "admin"]);
const enterprisePlans = new Set(["enterprise", "admin"]);

function apiEnvelope(data, extra = {}) {
  return { apiVersion: API_VERSION, data, ...extra };
}

function sessionUser(request) {
  return requestSession(request)?.user || null;
}

function requireSessionUser(request, response) {
  const user = sessionUser(request);
  if (!user) {
    json(response, 401, { error: "Sign in before using this account feature." });
    return null;
  }
  return user;
}

function planOf(user) {
  return effectivePlan(user);
}

function requirePlan(user, allowed, label) {
  if (!user || !allowed.has(planOf(user))) return { ok: false, status: 403, error: `Upgrade to ${label} to access this endpoint.` };
  return { ok: true };
}

function parseJsonArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function textSearch(value) {
  if (Array.isArray(value)) return value.map(textSearch).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textSearch).join(" ");
  return value ? String(value) : "";
}

function productHaystack(agent) {
  return [
    agent.name,
    agent.id,
    agent.slug,
    agent.description,
    agent.category,
    agent.ecosystem,
    agent.pricingType,
    agent.pricingTier,
    agent.price,
    agent.access,
    agent.vendorName,
    agent.vendor?.name,
    agent.githubRepo,
    textSearch(agent.searchKeywords),
    textSearch(agent.useCaseWeight),
    textSearch(agent.integrations),
    textSearch(agent.modelSupport),
  ].filter(Boolean).join(" ").toLowerCase();
}

const searchUseCaseRules = [
  ["Code generation", ["code", "coding", "developer", "repo", "pull request", "terminal", "ide"]],
  ["App building", ["app builder", "prompt to app", "vibe", "prototype", "full-stack", "frontend"]],
  ["Data analysis", ["data analysis", "analytics", "notebook", "research", "retrieval"]],
  ["Automation", ["automation", "workflow", "agentic", "orchestration", "autonomous"]],
  ["Agent infrastructure", ["mcp", "server", "sdk", "api", "tool", "integration", "runtime"]],
];

function uniqueValues(items, selector) {
  return [...new Set(items.map(selector).filter(Boolean))];
}

function inferQueryType(query) {
  const lower = query.toLowerCase();
  if (/\bcompare\b|\bvs\b| versus /.test(lower)) return "comparison";
  if (/\bresearch\b|\ball\b|\blist\b|\bshow\b/.test(lower)) return "broad_research";
  if (/\bfrom\b|\bvendor\b|\bcompany\b|\bprovider\b/.test(lower)) return "vendor_specific";
  if (/\bfree\b|open source|multi-model|locked|subscription|self-host/.test(lower)) return "constraint_based";
  return "use_case_match";
}

function parseRuleSearch(query, agents) {
  const lower = query.toLowerCase();
  const ecosystems = uniqueValues(agents, (agent) => agent.ecosystem);
  const categories = uniqueValues(agents, (agent) => agent.category || agent.displayCategory);
  const vendors = uniqueValues(agents, (agent) => agent.vendor?.name || agent.vendorName);
  const filters = {
    queryType: inferQueryType(query),
    ecosystem: ecosystems.find((value) => lower.includes(String(value).toLowerCase())) || null,
    category: categories.find((value) => lower.includes(String(value).toLowerCase())) || null,
    useCase: null,
    pricing: /\bfree\b|open source|\$0/.test(lower) ? "free" : (/paid|subscription|enterprise|commercial/.test(lower) ? "paid" : null),
    modelFlexibility: /multi[- ]?model|not locked|bring your own|provider flexible|model flexible/.test(lower) ? "multi_model" : (/provider[- ]?locked|locked/.test(lower) ? "provider_locked" : null),
    access: /open source|oss|public repo/.test(lower) ? "open_source" : (/closed|proprietary/.test(lower) ? "closed" : null),
    vendor: vendors.find((value) => lower.includes(String(value).toLowerCase())) || null,
    compareNames: [],
  };
  for (const [label, keywords] of searchUseCaseRules) {
    if (keywords.some((keyword) => lower.includes(keyword))) filters.useCase = label;
  }
  if (filters.queryType === "comparison") {
    filters.compareNames = agents.filter((agent) => lower.includes(String(agent.name || "").toLowerCase())).map((agent) => agent.slug).slice(0, 5);
  }
  const confidenceSignals = Object.values(filters).filter((value) => Array.isArray(value) ? value.length : Boolean(value)).length;
  return { filters, confidence: Math.min(1, confidenceSignals / 4) };
}

function agentMatchesSearch(agent, filters, query) {
  const haystack = productHaystack(agent);
  const lower = query.toLowerCase();
  if (filters.ecosystem && agent.ecosystem !== filters.ecosystem) return false;
  if (filters.category && ![agent.category, agent.displayCategory].includes(filters.category)) return false;
  if (filters.vendor && ![agent.vendor?.name, agent.vendorName].filter(Boolean).some((value) => String(value).toLowerCase() === filters.vendor.toLowerCase())) return false;
  if (filters.pricing === "free" && !/free|open source|\$0/.test(String(agent.pricingType + " " + agent.price + " " + agent.pricingTier).toLowerCase())) return false;
  if (filters.pricing === "paid" && /unknown/.test(String(agent.price || "").toLowerCase())) return false;
  if (filters.modelFlexibility === "multi_model" && !/multi|user configurable|bring/.test(textSearch(agent.modelSupport).toLowerCase())) return false;
  if (filters.modelFlexibility === "provider_locked" && !/locked|single|provider/.test(textSearch(agent.modelSupport).toLowerCase())) return false;
  if (filters.access === "open_source" && !(agent.hasPublicRepo || /open source/.test(String(agent.access || "").toLowerCase()))) return false;
  if (filters.access === "closed" && /open source/.test(String(agent.access || "").toLowerCase())) return false;
  if (filters.useCase && !haystack.includes(filters.useCase.toLowerCase())) return false;
  const meaningfulTerms = lower.split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !["what", "all", "with", "for", "from", "the", "and", "tools", "good", "research", "compare"].includes(term));
  return meaningfulTerms.length === 0 || meaningfulTerms.some((term) => haystack.includes(term)) || Object.values(filters).some(Boolean);
}

function rankSearchResult(agent, filters, query) {
  const haystack = productHaystack(agent);
  const lower = query.toLowerCase();
  let score = Number(agent.finalRank || agent.relevanceScore || agent.relevance_score || 0);
  if (agent.name && lower.includes(agent.name.toLowerCase())) score += 30;
  if (filters.vendor && [agent.vendor?.name, agent.vendorName].filter(Boolean).some((value) => String(value).toLowerCase() === filters.vendor.toLowerCase())) score += 20;
  if (filters.useCase && haystack.includes(filters.useCase.toLowerCase())) score += 15;
  if (typeof agent.freshnessScore === "number") score += agent.freshnessScore / 5;
  return score;
}

async function llmSearchFallback(query, ruleFilters) {
  if (!process.env.OPENAI_API_KEY) return { status: "unconfigured", filters: null };
  const model = process.env.APPURDEX_LLM_MODEL || "gpt-4o-mini";
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      queryType: { type: "string", enum: ["broad_research", "use_case_match", "comparison", "constraint_based", "vendor_specific"] },
      ecosystem: { type: ["string", "null"] },
      category: { type: ["string", "null"] },
      useCase: { type: ["string", "null"] },
      pricing: { type: ["string", "null"], enum: ["free", "paid", "enterprise", "unknown", null] },
      modelFlexibility: { type: ["string", "null"], enum: ["multi_model", "provider_locked", "unknown", null] },
      access: { type: ["string", "null"], enum: ["open_source", "closed", "unknown", null] },
      vendor: { type: ["string", "null"] },
    },
    required: ["queryType", "ecosystem", "category", "useCase", "pricing", "modelFlexibility", "access", "vendor"],
  };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: "Parse Appurdex product search queries into strict filters. Return only source-neutral filters, never facts about products." }] },
          { role: "user", content: [{ type: "input_text", text: `Query: ${query}\nRule filters: ${JSON.stringify(ruleFilters)}` }] },
        ],
        text: { format: { type: "json_schema", name: "appurdex_search_filters", strict: true, schema } },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { status: "error", error: body.error?.message || `OpenAI returned ${response.status}`, filters: null };
    const raw = body.output_text || body.output?.flatMap((item) => item.content || []).find((item) => item.text)?.text;
    return { status: "used", filters: raw ? JSON.parse(raw) : null };
  } catch (error) {
    return { status: "error", error: error.message, filters: null };
  }
}

function groupSearchResults(results, filters) {
  const groupBy = filters.useCase ? "useCase" : "category";
  const groups = new Map();
  for (const item of results) {
    const key = groupBy === "useCase" ? (filters.useCase || "Matched use case") : (item.category || item.displayCategory || "Uncategorized");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      slug: item.slug,
      name: item.name,
      category: item.category,
      ecosystem: item.ecosystem,
      pricing: item.price,
      modelFlexibility: item.modelSupport?.flexibility || item.modelSupport?.choice || null,
      sourceUrl: item.sourceUrl || item.website || null,
      verifiedAt: item.verifiedAt || item.lastCuratedAt || null,
      verificationStatus: item.verificationStatus || "unknown",
    });
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

async function buildResearchSearchResponse({ query, db, user }) {
  const agents = db.agents.map((agent) => publicAgent(agent, db));
  const parsed = parseRuleSearch(query, agents);
  let filters = parsed.filters;
  let parserSource = "rules";
  let llmFallback = "not_needed";
  if (parsed.confidence < 0.5 || /\?|should|best|recommend|which/i.test(query)) {
    const llm = await llmSearchFallback(query, parsed.filters);
    llmFallback = llm.status;
    if (llm.filters) {
      filters = { ...filters, ...Object.fromEntries(Object.entries(llm.filters).filter(([, value]) => value !== null && value !== undefined)) };
      parserSource = "llm";
    }
  }
  const results = agents
    .filter((agent) => agentMatchesSearch(agent, filters, query))
    .map((agent) => ({ ...agent, searchScore: rankSearchResult(agent, filters, query) }))
    .sort((a, b) => b.searchScore - a.searchScore || String(a.name).localeCompare(String(b.name)))
    .slice(0, 50);
  const freeCount = results.filter((agent) => /free|open source/.test(String(agent.price + " " + agent.pricingType).toLowerCase())).length;
  const paidCount = results.length - freeCount;
  const ecosystems = new Set(results.map((agent) => agent.ecosystem).filter(Boolean));
  const categories = new Set(results.map((agent) => agent.category).filter(Boolean));
  const summary = `Found ${results.length} source-backed product${results.length === 1 ? "" : "s"} across ${ecosystems.size} ecosystem${ecosystems.size === 1 ? "" : "s"} and ${categories.size} categor${categories.size === 1 ? "y" : "ies"}; ${freeCount} free/open-source, ${paidCount} paid or unknown.`;
  recordSearchLog({ userId: user?.id || null, query, parserSource, filters, resultCount: results.length });
  return {
    summary,
    parserSource,
    llmFallback,
    filters,
    groupedBy: filters.useCase ? "useCase" : "category",
    groups: groupSearchResults(results, filters),
    compareSuggestion: results.length >= 2 && results.length <= 5 ? { slugs: results.map((agent) => agent.slug), path: `/compare?agents=${results.map((agent) => agent.slug).join(",")}` } : null,
  };
}

function publicHistory(agent) {
  return agent.history || { pricingHistory: [], rankingHistory: [], repoStarHistory: [], freshnessHistory: [] };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function agentsCsv(agents) {
  const headers = ["slug", "name", "category", "ecosystem", "pricing", "sourceUrl", "lastSyncedAt", "verificationStatus"];
  const rows = agents.map((agent) => [agent.slug, agent.name, agent.category, agent.ecosystem, agent.price, agent.sourceUrl || agent.website || "", agent.lastSyncedAt || agent.last_synced_at || "", agent.verificationStatus || "unknown"]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function webhookSignature(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function deliverWebhook(endpoint, eventType, payload) {
  const body = JSON.stringify({ apiVersion: API_VERSION, eventType, createdAt: new Date().toISOString(), data: payload });
  const delivery = recordWebhookDelivery({ webhookId: endpoint.id, eventType, payload, status: "pending" });
  try {
    const response = await fetch(endpoint.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-appurdex-event": eventType,
        "x-appurdex-signature": `sha256=${webhookSignature(endpoint.secret, body)}`,
      },
      body,
    });
    const responseText = await response.text().catch(() => "");
    const retry = !response.ok;
    return updateWebhookDelivery(delivery.id, {
      status: retry ? "failed_retryable" : "delivered",
      attemptCount: 1,
      lastAttemptAt: new Date().toISOString(),
      responseStatus: response.status,
      responseBody: responseText,
      nextAttemptAt: retry ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
    });
  } catch (error) {
    return updateWebhookDelivery(delivery.id, {
      status: "failed_retryable",
      attemptCount: 1,
      lastAttemptAt: new Date().toISOString(),
      responseBody: error.message,
      nextAttemptAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }
}

async function deliverWebhookEvent(eventType, payload) {
  const endpoints = activeWebhookEndpointsForEvent(eventType);
  const deliveries = [];
  for (const endpoint of endpoints) deliveries.push(await deliverWebhook(endpoint, eventType, payload));
  return deliveries;
}

function eventTypeForReviewItem(item) {
  return eventTypeForChangeType(changeTypeForReviewItem(item));
}

function watchlistMatchesAlert(watchlist, alert) {
  return (watchlist.items || []).some((item) => item.productId === alert.productId && normalizeAlertTypes(item.alertTypes).includes(alert.changeType));
}

function recordWatchlistNotifications(alert, eventType) {
  if (!alert?.productId || !alert?.changeType || !eventType) return [];
  const records = [];
  for (const user of listDigestUsers()) {
    if (!listWatchlists(user.id).some((watchlist) => watchlistMatchesAlert(watchlist, alert))) continue;
    records.push(recordNotificationEvent({ userId: user.id, eventType, agentSlug: alert.agentSlug, payload: alert }));
  }
  return records;
}

function watchlistInputFromBody(body = {}) {
  const items = Array.isArray(body.items) ? body.items : [];
  const agentSlugs = parseJsonArray(body.agentSlugs);
  const alertTypes = normalizeAlertTypes(body.alertTypes);
  return { items, agentSlugs, alertTypes };
}

function displayChangeValue(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? value.map(displayChangeValue).join("; ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function comparableChangeValue(value) {
  if (value === undefined) return null;
  return JSON.stringify(value ?? null);
}

function appendAgentUpdateChangeItems(db, before, after) {
  const specs = [
    { field: "pricingPlans", type: "pricing_changed", changeType: "pricing", label: "pricing plans" },
    { field: "pricingTier", type: "pricing_changed", changeType: "pricing", label: "pricing tier" },
    { field: "access", type: "access_changed", changeType: "access", label: "access" },
    { field: "modelSupport", type: "model_support_changed", changeType: "access", label: "model flexibility" },
  ];
  for (const spec of specs) {
    if (comparableChangeValue(before?.[spec.field]) === comparableChangeValue(after?.[spec.field])) continue;
    const oldValue = displayChangeValue(before?.[spec.field]);
    const newValue = displayChangeValue(after?.[spec.field]);
    db.reviewQueue.unshift(makeReviewItem(
      spec.type,
      after.slug || after.id,
      `${after.name} ${spec.label} changed`,
      `${oldValue} -> ${newValue}`,
      after.pricingUrl || after.sourceUrl || after.website || "",
      "pending",
      { field: spec.field, oldValue, newValue, changeType: spec.changeType },
    ));
  }
}
async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const handledCustomerRoute = await handleAuthBillingRoute(request, response, url, { json, readJson, readRawBody });
  if (handledCustomerRoute !== false) return handledCustomerRoute;

  if (request.method === "GET" && pathname === "/api/health") return json(response, 200, healthState());

  const db = await readDb();

  if (request.method === "POST" && pathname === "/api/search/research") {
    const body = await readJson(request);
    const query = String(body.query || "").trim();
    if (!query) return json(response, 400, { error: "Search query is required." });
    const result = await buildResearchSearchResponse({ query, db, user: sessionUser(request) });
    return json(response, 200, apiEnvelope(result));
  }

  if (pathname.startsWith("/api/account/")) {
    const user = requireSessionUser(request, response);
    if (!user) return;
    if (!hasAccess(user, "watchlists") && pathname.startsWith("/api/account/watchlists")) return json(response, 403, { error: "Upgrade to Starter or Pro to use watchlists." });
    if (!hasAccess(user, "savedComparisons") && pathname.startsWith("/api/account/saved-comparisons")) return json(response, 403, { error: "Upgrade to Starter or Pro to save comparisons." });
    if (request.method === "GET" && pathname === "/api/account/watchlists") return json(response, 200, apiEnvelope(listWatchlists(user.id)));
    if (request.method === "POST" && pathname === "/api/account/watchlists") {
      const body = await readJson(request);
      return json(response, 201, apiEnvelope(createWatchlist({ userId: user.id, name: body.name, ...watchlistInputFromBody(body) })));
    }
    if (request.method === "DELETE" && pathname.startsWith("/api/account/watchlists/")) {
      const ok = deleteWatchlist({ userId: user.id, id: decodeURIComponent(pathname.split("/").pop()) });
      return json(response, ok ? 200 : 404, ok ? { ok: true } : { error: "Watchlist not found." });
    }
    if (request.method === "GET" && pathname === "/api/account/saved-comparisons") return json(response, 200, apiEnvelope(listSavedComparisons(user.id)));
    if (request.method === "POST" && pathname === "/api/account/saved-comparisons") {
      const body = await readJson(request);
      return json(response, 201, apiEnvelope(createSavedComparison({ userId: user.id, name: body.name, mode: body.mode, slugs: parseJsonArray(body.slugs) })));
    }
    if (request.method === "DELETE" && pathname.startsWith("/api/account/saved-comparisons/")) {
      const ok = deleteSavedComparison({ userId: user.id, id: decodeURIComponent(pathname.split("/").pop()) });
      return json(response, ok ? 200 : 404, ok ? { ok: true } : { error: "Saved comparison not found." });
    }
    return json(response, 404, { error: "Account route not found." });
  }
  if (request.method === "GET" && pathname === "/api/public/agents") return json(response, 200, publicState(db));
  if (request.method === "GET" && pathname.startsWith("/api/public/agents/")) {
    const agent = findAgent(db, decodeURIComponent(pathname.split("/").pop()));
    return agent ? json(response, 200, publicAgent(agent, db)) : json(response, 404, { error: "Agent not found." });
  }

  if (request.method === "POST" && pathname === "/api/suggestions") {
    const body = await readJson(request);
    const agent = findAgent(db, body.agentSlug);
    if (!agent) return json(response, 404, { error: "Agent not found." });
    const item = {
      id: crypto.randomUUID(),
      agentSlug: agent.slug,
      field: body.field || "general",
      suggestedValue: body.suggestedValue || "",
      sourceUrl: body.sourceUrl || "",
      notes: body.notes || "",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.suggestions.unshift(item);
    db.reviewQueue.unshift(makeReviewItem("community_suggestion", agent.slug, `${agent.name} suggested update`, `${item.field}: ${item.suggestedValue}`, item.sourceUrl));
    await writeDb(db);
    return json(response, 201, { ok: true, suggestion: item });
  }

  if (request.method === "POST" && pathname === "/api/vendor-claims") {
    const body = await readJson(request);
    const agent = findAgent(db, body.agentSlug);
    if (!agent) return json(response, 404, { error: "Agent not found." });
    const item = {
      id: crypto.randomUUID(),
      agentSlug: agent.slug,
      vendorName: body.vendorName || "",
      workEmail: body.workEmail || "",
      proofUrl: body.proofUrl || "",
      notes: body.notes || "",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.vendorClaims.unshift(item);
    db.reviewQueue.unshift(makeReviewItem("vendor_claim", agent.slug, `${agent.name} vendor claim`, `${item.vendorName} requested listing access.`, item.proofUrl));
    await writeDb(db);
    return json(response, 201, { ok: true, claim: item });
  }

  if (request.method === "GET" && pathname === "/api/admin/state") return json(response, 200, adminState(db));
  if (request.method === "GET" && pathname === "/api/admin/github-diagnostics") return json(response, 200, await githubDiagnostics());

  if (request.method === "PUT" && pathname.startsWith("/api/admin/agents/")) {
    const slug = decodeURIComponent(pathname.split("/").pop());
    const index = db.agents.findIndex((agent) => agent.slug === slug || agent.id === slug);
    if (index < 0) return json(response, 404, { error: "Agent not found." });
    const body = await readJson(request);
    const allowed = ["category", "description", "access", "pricingTier", "website", "logoUrl", "sourceUrl", "sourceLabel", "sourceType", "pricingUrl", "pricingLabel", "statusPageUrl", "statusPageLabel", "benchmarkUrl", "benchmarkLabel", "statusNote", "hasPublicRepo", "licenseType", "vendorId", "vendorName", "vendorWebsite", "vendorSourceUrl", "vendorSourceLabel", "maintainerName", "companyName", "company", "foundedAt", "launchDate", "modelSupport", "fieldVerification", "socialLinks", "socials", "twitterUrl", "xUrl", "linkedinUrl", "youtubeUrl", "ytUrl", "instagramUrl", "pricingPlans", "benchmarks", "capabilityMetrics", "operationalMetrics", "ecosystemHealth", "adoptionMetrics", "packages", "packageEcosystem", "packageName", "packageVersion"];
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    const beforeAgent = { ...db.agents[index] };
    db.agents[index] = { ...db.agents[index], ...updates, updatedAt: new Date().toISOString() };
    db.agents[index].sourceUrls = buildSourceUrls(db.agents[index]);
    appendAgentUpdateChangeItems(db, beforeAgent, db.agents[index]);
    await writeDb(db);
    return json(response, 200, { ok: true, agent: publicAgent(db.agents[index], db) });
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/admin/review-queue/")) {
    const id = decodeURIComponent(pathname.split("/").pop());
    const item = db.reviewQueue.find((entry) => entry.id === id);
    if (!item) return json(response, 404, { error: "Review item not found." });
    const body = await readJson(request);
    item.status = body.status || item.status;
    item.resolutionNote = body.resolutionNote || item.resolutionNote || "";
    item.updatedAt = new Date().toISOString();
    await writeDb(db);
    const eventType = eventTypeForReviewItem(item);
    const alert = publicChangeAlert(item);
    const webhookDeliveries = eventType ? await deliverWebhookEvent(eventType, alert) : [];
    const notificationEvents = eventType ? recordWatchlistNotifications(alert, eventType) : [];
    return json(response, 200, { ok: true, item, webhookDeliveries, notificationEvents });
  }

  if (request.method === "POST" && pathname === "/api/admin/api-keys") {
    const session = requestSession(request);
    if (effectivePlan(session?.user) !== "admin") return json(response, 403, { error: "Admin role is required to create admin API keys." });
    const body = await readJson(request);
    const record = createApiKeyRecord(body);
    record.tokenPreview = `${record.token.slice(0, 8)}...${record.token.slice(-4)}`;
    db.apiKeys.unshift(record);
    await writeDb(db);
    return json(response, 201, { ok: true, apiKey: record });
  }

  if (request.method === "POST" && pathname === "/api/admin/run-worker") {
    const result = await runWorker({ tiered: true, reason: "admin" });
    return json(response, 200, { ok: true, result });
  }

  if ((request.method === "GET" || request.method === "POST") && pathname === "/api/cron/hourly-sync") {
    if (!authorizedCronRequest(request)) return json(response, 401, { error: "Missing or invalid Appurdex cron authorization." });
    const result = await runScheduledWorker("cloud-cron");
    const freshness = await runFreshnessRefresh("cloud-cron");
    return json(response, result.skipped ? 202 : 200, { ok: !result.skipped, freshness, ...result });
  }

  if ((request.method === "GET" || request.method === "POST") && pathname === "/api/cron/weekly-digest") {
    if (!authorizedCronRequest(request)) return json(response, 401, { error: "Missing or invalid Appurdex cron authorization." });
    const since = url.searchParams.get("since") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const events = listNotificationEventsSince(since);
    const results = [];
    for (const user of listDigestUsers()) {
      const digest = buildWeeklyDigest({ user, watchlists: listWatchlists(user.id), events });
      const delivery = await sendWeeklyDigestEmail({ user, digest });
      results.push({ userId: user.id, email: user.email, alertCount: digest.alertCount, sections: digest.sections.map((section) => section.heading), delivery });
    }
    return json(response, 200, { ok: true, since, userCount: results.length, results });
  }
  if (pathname.startsWith("/api/v1/")) {
    const customerAuth = authenticateCustomerApiKey(request, pathname);
    if (customerAuth?.ok === false) return json(response, customerAuth.status, { error: customerAuth.error, usage: customerAuth.usage || null }, customerAuth.headers || {});
    let apiUser = customerAuth?.user || null;
    if (!customerAuth) {
      const auth = requireApiKey(db, request);
      if (!auth.ok) return json(response, auth.status, { error: auth.error });
      await writeDb(db);
    }

    const apiHeaders = customerAuth?.headers || {};
    const plan = planOf(apiUser);
    const publicAgents = () => db.agents.map((agent) => publicAgent(agent, db));
    const requireStarter = () => requirePlan(apiUser, starterPlans, "Starter");
    const requirePro = () => requirePlan(apiUser, proPlans, "Pro");
    const requireEnterprise = () => requirePlan(apiUser, enterprisePlans, "Enterprise");

    if (request.method === "GET" && pathname === "/api/v1/agents") return json(response, 200, apiEnvelope(publicAgents()), apiHeaders);
    if (request.method === "GET" && pathname.startsWith("/api/v1/agents/")) {
      const agent = findAgent(db, decodeURIComponent(pathname.split("/").pop()));
      return agent ? json(response, 200, apiEnvelope(publicAgent(agent, db)), apiHeaders) : json(response, 404, { error: "Agent not found." }, apiHeaders);
    }
    if (request.method === "GET" && pathname === "/api/v1/categories") return json(response, 200, apiEnvelope([...new Set(db.agents.map((agent) => agent.category))].sort()), apiHeaders);
    if (request.method === "GET" && pathname === "/api/v1/pricing") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      return json(response, 200, apiEnvelope(db.agents.map((agent) => publicPricing(agent, db)), { modelPricing: (db.modelPricing || []).map((entry) => publicModelPricingEntry(entry, db)) }), apiHeaders);
    }
    if (request.method === "GET" && pathname === "/api/v1/model-pricing") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      return json(response, 200, apiEnvelope((db.modelPricing || []).map((entry) => publicModelPricingEntry(entry, db)), { sources: db.modelPricingSources || [] }), apiHeaders);
    }
    if (request.method === "GET" && pathname === "/api/v1/source-catalog") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      return json(response, 200, apiEnvelope({ freeDataSources: db.freeDataSources || [], fieldDataPolicies: db.fieldDataPolicies || {} }), apiHeaders);
    }
    if (request.method === "GET" && pathname.startsWith("/api/v1/history/")) {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const agent = findAgent(db, decodeURIComponent(pathname.split("/").pop()));
      return agent ? json(response, 200, apiEnvelope(publicHistory(publicAgent(agent, db))), apiHeaders) : json(response, 404, { error: "Agent not found." }, apiHeaders);
    }
    if (request.method === "GET" && pathname.startsWith("/api/v1/appurscore/")) {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const agent = findAgent(db, decodeURIComponent(pathname.split("/").pop()));
      return agent ? json(response, 200, apiEnvelope(publicAgent(agent, db).appurScore), apiHeaders) : json(response, 404, { error: "Agent not found." }, apiHeaders);
    }
    if (request.method === "GET" && pathname === "/api/v1/alerts") {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const data = (db.reviewQueue || []).filter((item) => publicAlertTypes.has(item.type)).map(publicChangeAlert);
      return json(response, 200, apiEnvelope(data), apiHeaders);
    }
    if (request.method === "GET" && pathname === "/api/v1/bulk/agents") {
      const access = requireEnterprise();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const format = url.searchParams.get("format");
      if (format === "csv") {
        response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", ...apiHeaders });
        response.end(agentsCsv(publicAgents()));
        return;
      }
      return json(response, 200, apiEnvelope(publicAgents()), apiHeaders);
    }
    if (pathname === "/api/v1/watchlists") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      if (request.method === "GET") return json(response, 200, apiEnvelope(listWatchlists(apiUser.id)), apiHeaders);
      if (request.method === "POST") {
        const body = await readJson(request);
        return json(response, 201, apiEnvelope(createWatchlist({ userId: apiUser.id, name: body.name, ...watchlistInputFromBody(body) })), apiHeaders);
      }
    }
    if (pathname.startsWith("/api/v1/watchlists/") && request.method === "DELETE") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const ok = deleteWatchlist({ userId: apiUser.id, id: decodeURIComponent(pathname.split("/").pop()) });
      return json(response, ok ? 200 : 404, ok ? { ok: true, apiVersion: API_VERSION } : { error: "Watchlist not found." }, apiHeaders);
    }
    if (pathname === "/api/v1/saved-comparisons") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      if (request.method === "GET") return json(response, 200, apiEnvelope(listSavedComparisons(apiUser.id)), apiHeaders);
      if (request.method === "POST") {
        const body = await readJson(request);
        return json(response, 201, apiEnvelope(createSavedComparison({ userId: apiUser.id, name: body.name, mode: body.mode, slugs: parseJsonArray(body.slugs) })), apiHeaders);
      }
    }
    if (pathname.startsWith("/api/v1/saved-comparisons/") && request.method === "DELETE") {
      const access = requireStarter();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const ok = deleteSavedComparison({ userId: apiUser.id, id: decodeURIComponent(pathname.split("/").pop()) });
      return json(response, ok ? 200 : 404, ok ? { ok: true, apiVersion: API_VERSION } : { error: "Saved comparison not found." }, apiHeaders);
    }
    if (pathname === "/api/v1/webhooks") {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      if (request.method === "GET") return json(response, 200, apiEnvelope(listWebhookEndpoints(apiUser.id)), apiHeaders);
      if (request.method === "POST") {
        const body = await readJson(request);
        try {
          return json(response, 201, apiEnvelope(createWebhookEndpoint({ userId: apiUser.id, name: body.name, targetUrl: body.targetUrl, events: body.events })), apiHeaders);
        } catch (error) {
          return json(response, 400, { error: error.message }, apiHeaders);
        }
      }
    }
    if (pathname === "/api/v1/webhook-deliveries" && request.method === "GET") {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      return json(response, 200, apiEnvelope(listWebhookDeliveries({ userId: apiUser.id })), apiHeaders);
    }
    if (pathname.startsWith("/api/v1/webhooks/")) {
      const access = requirePro();
      if (!access.ok) return json(response, access.status, { error: access.error }, apiHeaders);
      const parts = pathname.split("/").filter(Boolean);
      const webhookId = decodeURIComponent(parts[3] || "");
      if (request.method === "DELETE" && parts.length === 4) {
        const ok = deleteWebhookEndpoint({ userId: apiUser.id, id: webhookId });
        return json(response, ok ? 200 : 404, ok ? { ok: true, apiVersion: API_VERSION } : { error: "Webhook not found." }, apiHeaders);
      }
      if (request.method === "POST" && parts[4] === "test") {
        const endpoint = getWebhookEndpointForUser({ userId: apiUser.id, id: webhookId, includeSecret: true });
        if (!endpoint) return json(response, 404, { error: "Webhook not found." }, apiHeaders);
        const delivery = await deliverWebhook(endpoint, "webhook.test", { message: "Appurdex webhook test", webhookId });
        return json(response, 200, apiEnvelope(delivery), apiHeaders);
      }
      if (request.method === "GET" && parts[4] === "deliveries") return json(response, 200, apiEnvelope(listWebhookDeliveries({ userId: apiUser.id, webhookId })), apiHeaders);
    }
  }
  return json(response, 404, { error: "Route not found." });
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

async function serveStatic(response, pathname) {
  const filePath = pathname === "/" ? path.join(distDir, "index.html") : path.join(distDir, pathname);
  const safePath = path.normalize(filePath);
  if (!safePath.startsWith(distDir)) return false;
  try {
    const stat = await fs.stat(safePath);
    if (!stat.isFile()) return false;
    response.writeHead(200, { "Content-Type": mimeTypes.get(path.extname(safePath)) || "application/octet-stream" });
    response.end(await fs.readFile(safePath));
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": response.req?.headers.origin || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, stripe-signature, x-appurdex-api-key, X-Appurdex-Api-Key, X-Appurdex-Key, x-appurdex-cron-secret",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      });
      response.end();
      return;
    }
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    if (await serveStatic(response, url.pathname)) return;
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(await fs.readFile(path.join(distDir, "index.html"), "utf8"));
  } catch (error) {
    json(response, 500, { error: error.message });
  }
});


let scheduledWorkerRunning = false;
let freshnessRefreshRunning = false;

async function runScheduledWorker(reason) {
  if (scheduledWorkerRunning) return { skipped: true, status: "already_running" };
  scheduledWorkerRunning = true;
  try {
    const result = await runWorker({ tiered: true, reason });
    console.log(`Appurdex worker ${reason} completed: checked ${result.checked}`);
    return { skipped: false, status: "completed", result };
  } catch (error) {
    console.error(`Appurdex worker ${reason} failed:`, error);
    return { skipped: false, status: "failed", error: error.message };
  } finally {
    scheduledWorkerRunning = false;
  }
}


async function runFreshnessRefresh(reason) {
  if (freshnessRefreshRunning) return { skipped: true, status: "already_running" };
  freshnessRefreshRunning = true;
  try {
    const result = await refreshFreshnessScores();
    console.log(`Appurdex freshness ${reason} completed: refreshed ${result.checked}`);
    return { skipped: false, status: "completed", result };
  } catch (error) {
    console.error(`Appurdex freshness ${reason} failed:`, error);
    return { skipped: false, status: "failed", error: error.message };
  } finally {
    freshnessRefreshRunning = false;
  }
}
function startWorkerScheduler() {
  if (process.env.APPURDEX_WORKER_DISABLED === "true") return;
  const startupDelayMs = Number(process.env.APPURDEX_WORKER_STARTUP_DELAY_MS || 1500);
  if (Number.isFinite(startupDelayMs) && startupDelayMs >= 0) {
    const startupTimer = setTimeout(() => runScheduledWorker("startup"), startupDelayMs);
    startupTimer.unref?.();
  }

  const intervalMs = Number(process.env.APPURDEX_WORKER_INTERVAL_MS || 30 * 60 * 1000);
  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    const interval = setInterval(() => runScheduledWorker("scheduled"), intervalMs);
    interval.unref?.();
  }

  const freshnessIntervalMs = Number(process.env.APPURDEX_FRESHNESS_INTERVAL_MS || 60 * 60 * 1000);
  if (Number.isFinite(freshnessIntervalMs) && freshnessIntervalMs > 0) {
    const freshnessInterval = setInterval(() => runFreshnessRefresh("scheduled"), freshnessIntervalMs);
    freshnessInterval.unref?.();
  }
}
server.listen(port, () => {
  console.log(`Appurdex backend listening on http://127.0.0.1:${port}`);
  startWorkerScheduler();
});








