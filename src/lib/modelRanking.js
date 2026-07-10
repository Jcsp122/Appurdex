export const MODEL_RANKING_METHODOLOGY_VERSION = "appurdex-llm-coding-v1";

const RANKING_WEIGHTS = {
  coding: 0.5,
  general: 0.2,
  priceEfficiency: 0.2,
  contextAvailability: 0.1,
};

const availabilityScores = {
  current: 100,
  preview: 70,
  limited_availability: 60,
  scheduled: 40,
  deprecated: 0,
  retired: 0,
  retired_except_cloud: 0,
};

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function standardReferenceCost(model) {
  const standard = (model?.pricingPlans || []).find((plan) => plan?.id === "standard");
  if (!standard) return null;
  const prices = standard.pricesUsdPerMillion || {};
  const input = finiteNumber(prices.input ?? prices.inputTextImageVideo);
  const output = finiteNumber(prices.output);
  return input === null || output === null ? null : input + output;
}

export function percentileScore(values, value, higherIsBetter = true) {
  const numericValues = values.map(finiteNumber).filter((item) => item !== null);
  const target = finiteNumber(value);
  if (!numericValues.length || target === null) return null;
  const betterSide = numericValues.filter((item) => higherIsBetter ? item < target : item > target).length;
  const equal = numericValues.filter((item) => item === target).length;
  return Math.round((100 * (betterSide + equal * 0.5) / numericValues.length) * 100) / 100;
}

function benchmarkMatch(model) {
  const benchmark = model?.benchmarkScores;
  const modelIdentifier = String(model?.modelId || model?.model || "").trim().toLowerCase();
  const benchmarkIdentifier = String(benchmark?.benchmarkModelId || "").trim().toLowerCase();
  if (!benchmark) return { benchmark: null, reason: "No exact LiveBench result for this model ID." };
  if (!modelIdentifier || benchmarkIdentifier !== modelIdentifier) {
    return { benchmark: null, reason: "LiveBench result does not exactly match this model ID." };
  }
  if (!benchmark.sourceUrl || !benchmark.verifiedAt || finiteNumber(benchmark.coding?.percentile) === null || finiteNumber(benchmark.general?.percentile) === null) {
    return { benchmark: null, reason: "Benchmark result is missing a score, source, or verification date." };
  }
  return { benchmark, reason: null };
}

function contextAvailabilityScore(model) {
  const contextWindowTokens = finiteNumber(model?.contextWindowTokens);
  if (contextWindowTokens === null || contextWindowTokens <= 0 || !model?.contextSourceUrl || !model?.contextVerifiedAt) return null;
  const contextScore = Math.min(100, (contextWindowTokens / 1_000_000) * 100);
  const availability = availabilityScores[String(model?.status || "current").toLowerCase()] ?? 50;
  return Math.round((contextScore * 0.7 + availability * 0.3) * 100) / 100;
}

function eligibility(model, priceEfficiency) {
  const matched = benchmarkMatch(model);
  if (!matched.benchmark) return { eligible: false, reason: matched.reason, benchmark: null, contextAvailability: null };
  if (standardReferenceCost(model) === null || priceEfficiency === null) {
    return { eligible: false, reason: "Standard input and output pricing is required.", benchmark: matched.benchmark, contextAvailability: null };
  }
  const contextAvailability = contextAvailabilityScore(model);
  if (contextAvailability === null) {
    return { eligible: false, reason: "A sourced context window and availability status are required.", benchmark: matched.benchmark, contextAvailability: null };
  }
  return { eligible: true, reason: null, benchmark: matched.benchmark, contextAvailability };
}

export function rankModels(models = []) {
  const rows = Array.isArray(models) ? models : [];
  const pricedRows = rows.map((model) => ({ model, cost: standardReferenceCost(model) })).filter((row) => row.cost !== null);
  const costs = pricedRows.map((row) => row.cost);
  const enriched = rows.map((model) => {
    const cost = standardReferenceCost(model);
    const priceEfficiency = cost === null ? null : percentileScore(costs, cost, false);
    const state = eligibility(model, priceEfficiency);
    if (!state.eligible) {
      return {
        ...model,
        ranking: null,
        rankingEligibilityReason: state.reason,
      };
    }
    const coding = finiteNumber(state.benchmark.coding.percentile);
    const general = finiteNumber(state.benchmark.general.percentile);
    const score = Math.round(
      coding * RANKING_WEIGHTS.coding
      + general * RANKING_WEIGHTS.general
      + priceEfficiency * RANKING_WEIGHTS.priceEfficiency
      + state.contextAvailability * RANKING_WEIGHTS.contextAvailability,
    );
    return {
      ...model,
      ranking: {
        eligible: true,
        score,
        methodologyVersion: MODEL_RANKING_METHODOLOGY_VERSION,
        verifiedAt: state.benchmark.verifiedAt,
        components: {
          coding,
          general,
          priceEfficiency,
          contextAvailability: state.contextAvailability,
        },
      },
      rankingEligibilityReason: null,
    };
  });

  return enriched
    .sort((a, b) => {
      if (Boolean(a.ranking) !== Boolean(b.ranking)) return a.ranking ? -1 : 1;
      if (a.ranking && b.ranking) {
        return b.ranking.score - a.ranking.score
          || Number(b.benchmarkScores?.coding?.raw || 0) - Number(a.benchmarkScores?.coding?.raw || 0)
          || Number(b.benchmarkScores?.general?.raw || 0) - Number(a.benchmarkScores?.general?.raw || 0)
          || String(a.model || "").localeCompare(String(b.model || ""));
      }
      return String(a.provider || "").localeCompare(String(b.provider || ""))
        || String(a.model || "").localeCompare(String(b.model || ""));
    })
    .map((model, index, sorted) => ({
      ...model,
      ranking: model.ranking ? { ...model.ranking, rank: sorted.slice(0, index + 1).filter((row) => row.ranking).length } : null,
    }));
}

