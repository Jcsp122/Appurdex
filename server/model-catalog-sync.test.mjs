import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDiscoveredModels,
  parseAnthropicCatalog,
  parseGoogleModelIds,
  parseGooglePricingHtml,
  parseOpenAiModelIds,
  parseOpenAiModelMetadata,
  parseOpenAiPricingMarkdown,
  syncOfficialModelCatalog,
  validateDiscoveredModel,
} from "./model-catalog-sync.mjs";

// Exact excerpts from the official provider sources verified on 2026-07-11.
const openAiModels = '<a href="/api/docs/models/gpt-5.6-sol">GPT-5.6 Sol</a> Model ID gpt-5.6-sol Context window 1.05M';
const openAiPricing = `
<div data-content-switcher-pane data-value="standard"><TextTokenPricingTables tier="standard" rows={[
  ["gpt-5.6-sol", 5, 0.5, 6.25, 30],
]} /></div>
<div data-content-switcher-pane data-value="batch"><TextTokenPricingTables tier="batch" rows={[
  ["gpt-5.6-sol", 2.5, 0.25, 3.125, 15],
]} /></div>`;

test("OpenAI parser auto-publishes only exact active model IDs with official tiers", () => {
  const rows = parseOpenAiPricingMarkdown(openAiPricing, parseOpenAiModelIds(openAiModels), "2026-07-11T00:00:00Z", parseOpenAiModelMetadata(openAiModels));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modelId, "gpt-5.6-sol");
  assert.deepEqual(rows[0].pricingPlans.map((item) => item.id), ["standard", "batch"]);
  assert.equal(rows[0].pricingPlans[0].pricesUsdPerMillion.cacheWrite, 6.25);
  assert.equal(rows[0].contextWindowTokens, 1_050_000);
});

const anthropicModels = `
| Feature | Claude Fable 5 |
| --- | --- |
| **Claude API ID** | claude-fable-5 |
| **Context window** | 1M tokens |`;
const anthropicPricing = `
| Model | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- | --- | --- |
| Claude Fable 5 | $10 / MTok | $12.50 / MTok | $20 / MTok | $1 / MTok | $50 / MTok |

| Model | Batch input | Batch output |
| --- | --- | --- |
| Claude Fable 5 | $5 / MTok | $25 / MTok |`;

test("Anthropic parser joins exact official model IDs, context, standard, and batch pricing", () => {
  const rows = parseAnthropicCatalog(anthropicPricing, anthropicModels, "2026-07-11T00:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modelId, "claude-fable-5");
  assert.equal(rows[0].contextWindowTokens, 1_000_000);
  assert.equal(rows[0].pricingPlans[1].pricesUsdPerMillion.output, 25);
});

const googleModels = '<a href="/gemini-api/docs/models/gemini-3.5-flash">Gemini 3.5 Flash</a>';
const googlePricing = `
<h2 id="gemini-3.5-flash">Gemini 3.5 Flash</h2>
<table><tbody>
<tr><td>Input price</td><td>Free of charge</td><td>$0.50, prompts &lt;= 200k tokens<br>$1.00, prompts &gt; 200k</td></tr>
<tr><td>Output price</td><td>Free of charge</td><td>$3.00, prompts &lt;= 200k tokens<br>$4.50, prompts &gt; 200k</td></tr>
<tr><td>Context caching price</td><td>Free of charge</td><td>$0.05<br>$0.10</td></tr>
</tbody></table><h2 id="notes">Notes</h2>`;

test("Google parser uses exact model-page IDs and paid-tier pricing", () => {
  const rows = parseGooglePricingHtml(googlePricing, parseGoogleModelIds(googleModels), "2026-07-11T00:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].modelId, "gemini-3.5-flash");
  assert.equal(rows[0].pricingPlans[0].pricesUsdPerMillion.inputOver200k, 1);
  assert.equal(rows[0].pricingPlans[0].pricesUsdPerMillion.output, 3);
});

test("merge preserves exact benchmark and context metadata while updating prices", () => {
  const discovered = parseOpenAiPricingMarkdown(openAiPricing, parseOpenAiModelIds(openAiModels), "2026-07-11T00:00:00Z", parseOpenAiModelMetadata(openAiModels))[0];
  const existing = [{ ...discovered, benchmarkScores: { benchmarkModelId: "gpt-5.6-sol" }, contextWindowTokens: 1_050_000, pricingPlans: [] }];
  const result = mergeDiscoveredModels(existing, [discovered]);
  assert.equal(result.inserted, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.models[0].benchmarkScores.benchmarkModelId, "gpt-5.6-sol");
  assert.equal(result.models[0].contextWindowTokens, 1_050_000);
  assert.equal(result.models[0].pricingPlans.length, 2);
});

test("validation rejects provider rows without exact IDs or complete prices", () => {
  assert.equal(validateDiscoveredModel({ provider: "Unknown", modelId: "model", pricingPlans: [] }), false);
  assert.equal(validateDiscoveredModel({ provider: "OpenAI", modelId: "", pricingPlans: [] }), false);
});


test("provider failures are isolated and an older sync version refreshes immediately", async () => {
  const db = {
    modelPricing: [],
    modelPricingSourceChecks: {
      "openai-api-pricing": { next_sync_at: "2099-01-01T00:00:00Z" },
      "anthropic-claude-api-pricing": { next_sync_at: "2099-01-01T00:00:00Z" },
      "google-gemini-api-pricing": { next_sync_at: "2099-01-01T00:00:00Z" },
    },
  };
  const fetchImpl = async (url) => {
    if (url.includes("platform.claude.com")) return { ok: false, status: 503, text: async () => "" };
    if (url.includes("openai.com/api/docs/pricing")) return { ok: true, status: 200, text: async () => openAiPricing };
    if (url.includes("openai.com/api/docs/models")) return { ok: true, status: 200, text: async () => openAiModels };
    if (url.includes("ai.google.dev/gemini-api/docs/pricing")) return { ok: true, status: 200, text: async () => googlePricing };
    if (url.includes("ai.google.dev/gemini-api/docs/models")) return { ok: true, status: 200, text: async () => googleModels };
    throw new Error(`Unexpected URL: ${url}`);
  };

  const results = await syncOfficialModelCatalog(db, { fetchImpl, verifiedAt: "2026-07-11T00:00:00Z" });
  assert.deepEqual(results.map((item) => [item.provider, item.status]), [["OpenAI", "ok"], ["Anthropic", "error"], ["Google", "ok"]]);
  assert.deepEqual([...new Set(db.modelPricing.map((item) => item.provider))], ["OpenAI", "Google"]);
  assert.equal(db.modelPricingSourceChecks["openai-api-pricing"].catalogSyncVersion, 1);
});