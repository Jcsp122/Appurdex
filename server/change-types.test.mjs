import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { buildWeeklyDigest, renderWeeklyDigest, sendWeeklyDigestEmail } from "./digest.mjs";
import { changeTypeForField, changeTypeForReviewItem, normalizeAlertTypes } from "./change-types.mjs";

test("change type mapping covers pricing, access, new tool, and freshness", () => {
  assert.equal(changeTypeForField("pricingPlans"), "pricing");
  assert.equal(changeTypeForField("modelSupport.providers"), "access");
  assert.equal(changeTypeForReviewItem({ type: "tool_added", field: "category" }), "new_tool");
  assert.equal(changeTypeForReviewItem({ type: "freshness_changed", field: "freshness" }), "freshness");
});

test("subscription-only to API-available is an access change", () => {
  assert.equal(changeTypeForReviewItem({
    type: "access_changed",
    field: "access",
    oldValue: "Subscription-only",
    newValue: "API available",
  }), "access");
});

test("watchlist preferences persist and legacy watchlists default to all alert types", async () => {
  const dbDir = mkdtempSync(path.join(tmpdir(), "appurdex-watchlist-"));
  const dbPath = path.join(dbDir, "customers.sqlite");
  process.env.APPURDEX_DB_PATH = dbPath;
  const store = await import(`./customer-store.mjs?test=${Date.now()}`);
  const user = store.upsertUserByEmail("watchlist-test@example.com", { role: "pro", plan_id: "pro", subscription_status: "active" });

  store.createWatchlist({
    userId: user.id,
    name: "Scoped alerts",
    items: [
      { productId: "cursor", alertTypes: ["pricing", "access"] },
      { productId: "claude-code", alertTypes: ["freshness"] },
    ],
  });

  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO watchlists (id, user_id, name, agent_slugs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), user.id, "Legacy alerts", JSON.stringify(["legacy-tool"]), now, now);
  db.close();

  const watchlists = store.listWatchlists(user.id);
  const scoped = watchlists.find((item) => item.name === "Scoped alerts");
  const legacy = watchlists.find((item) => item.name === "Legacy alerts");
  assert.deepEqual(scoped.items, [
    { productId: "cursor", alertTypes: ["pricing", "access"] },
    { productId: "claude-code", alertTypes: ["freshness"] },
  ]);
  assert.deepEqual(legacy.items, [{ productId: "legacy-tool", alertTypes: ["pricing", "access", "new_tool", "freshness"] }]);
  assert.deepEqual(legacy.agentSlugs, ["legacy-tool"]);
});

test("digest groups matching real events by change type and reports missing email config honestly", async () => {
  const digest = buildWeeklyDigest({
    user: { email: "digest@example.com" },
    watchlists: [{ items: [{ productId: "cursor", alertTypes: normalizeAlertTypes(["pricing", "access", "new_tool", "freshness"]) }] }],
    events: [
      { id: "price", payload: { productId: "cursor", changeType: "pricing", title: "Cursor pricing changed", detectedAt: "2026-07-01T00:00:00.000Z" } },
      { id: "access", payload: { productId: "cursor", changeType: "access", title: "Cursor API available", detectedAt: "2026-07-02T00:00:00.000Z" } },
      { id: "tool", payload: { productId: "cursor", changeType: "new_tool", title: "New related tool added", detectedAt: "2026-07-03T00:00:00.000Z" } },
      { id: "fresh", payload: { productId: "cursor", changeType: "freshness", title: "Cursor moved stale", detectedAt: "2026-07-04T00:00:00.000Z" } },
      { id: "ignored", payload: { productId: "other", changeType: "pricing", title: "Ignored" } },
    ],
  });
  const rendered = renderWeeklyDigest(digest);
  assert.match(rendered.text, /Pricing Changes/);
  assert.match(rendered.text, /Access\/Availability Changes/);
  assert.match(rendered.text, /New Tools/);
  assert.match(rendered.text, /Freshness Changes/);
  assert.equal(digest.alertCount, 4);

  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  const delivery = await sendWeeklyDigestEmail({ user: { email: "digest@example.com" }, digest });
  assert.equal(delivery.ok, false);
  assert.equal(delivery.status, "unconfigured");
  assert.deepEqual(delivery.missing.sort(), ["EMAIL_FROM", "RESEND_API_KEY"]);
  if (oldKey !== undefined) process.env.RESEND_API_KEY = oldKey;
  if (oldFrom !== undefined) process.env.EMAIL_FROM = oldFrom;
});