import assert from "node:assert/strict";
import test from "node:test";
import { percentileScore, rankModels, standardReferenceCost } from "../src/lib/modelRanking.js";
import { modelPricingCatalog } from "../src/data/modelPricing.js";

function model(overrides = {}) {
  return {
    id: "provider-model-a",
    provider: "Provider",
    model: "model-a",
    modelId: "model-a",
    status: "current",
    pricingPlans: [{ id: "standard", pricesUsdPerMillion: { input: 2, output: 8 } }],
    contextWindowTokens: 1_000_000,
    contextSourceUrl: "https://example.com/context",
    contextVerifiedAt: "2026-06-25",
    benchmarkScores: {
      benchmarkModelId: "model-a",
      sourceUrl: "https://livebench.ai/table_2026_06_25.csv",
      verifiedAt: "2026-06-25",
      coding: { raw: 80, percentile: 90 },
      general: { raw: 70, percentile: 70 },
    },
    ...overrides,
  };
}

test("percentileScore uses midranks and reverses lower-is-better metrics", () => {
  assert.equal(percentileScore([10, 20, 30], 20), 50);
  assert.equal(percentileScore([10, 20, 30], 10, false), 83.33);
});

test("standardReferenceCost requires a comparable standard input and output price", () => {
  assert.equal(standardReferenceCost(model()), 10);
  assert.equal(standardReferenceCost(model({ pricingPlans: [{ id: "batch", pricesUsdPerMillion: { input: 1, output: 4 } }] })), null);
});

test("rankModels calculates the documented weighted score", () => {
  const [ranked] = rankModels([model()]);
  assert.equal(ranked.ranking.score, 79);
  assert.equal(ranked.ranking.rank, 1);
  assert.equal(ranked.ranking.components.coding, 90);
  assert.equal(ranked.ranking.components.general, 70);
  assert.equal(ranked.ranking.components.contextAvailability, 100);
});

test("rankModels does not infer or zero-fill a mismatched benchmark model", () => {
  const [unranked] = rankModels([model({ benchmarkScores: { ...model().benchmarkScores, benchmarkModelId: "model-a-high" } })]);
  assert.equal(unranked.ranking, null);
  assert.match(unranked.rankingEligibilityReason, /does not exactly match/i);
});

test("rankModels leaves missing benchmark data unranked with an explicit reason", () => {
  const [unranked] = rankModels([model({ benchmarkScores: null })]);
  assert.equal(unranked.ranking, null);
  assert.match(unranked.rankingEligibilityReason, /No exact LiveBench result/i);
});

test("rankModels breaks score ties by coding, then general, then model name", () => {
  const rows = rankModels([
    model({ id: "b", model: "model-b", modelId: "model-b", benchmarkScores: { ...model().benchmarkScores, benchmarkModelId: "model-b", coding: { raw: 82, percentile: 90 } } }),
    model({ id: "a", model: "model-a", modelId: "model-a", benchmarkScores: { ...model().benchmarkScores, benchmarkModelId: "model-a", coding: { raw: 80, percentile: 90 } } }),
  ]);
  assert.equal(rows[0].model, "model-b");
  assert.equal(rows[1].model, "model-a");
});


test("every published ranked catalog model has complete direct sources", () => {
  const ranked = rankModels(modelPricingCatalog).filter((entry) => entry.ranking);
  assert.deepEqual(ranked.map((entry) => entry.modelId || entry.model), ["gpt-5.5"]);
  for (const entry of ranked) {
    assert.ok(entry.benchmarkScores.sourceUrl);
    assert.ok(entry.benchmarkScores.verifiedAt);
    assert.ok(entry.sourceUrl);
    assert.ok(entry.contextSourceUrl);
    assert.ok(entry.contextVerifiedAt);
  }
  const unranked = rankModels(modelPricingCatalog).filter((entry) => !entry.ranking);
  assert.ok(unranked.every((entry) => entry.rankingEligibilityReason));
});
