export const syncTiers = ["top", "high", "mid", "long_tail"];

export const syncTierAliases = {
  hot: "top",
  important: "high",
  warm: "mid",
  cold: "long_tail",
  long: "long_tail",
};

export const syncTierIntervalsMs = {
  top: 30 * 60 * 1000,
  high: 60 * 60 * 1000,
  mid: 6 * 60 * 60 * 1000,
  long_tail: 24 * 60 * 60 * 1000,
};

export const freshnessLambdas = {
  top: 0.1,
  high: 0.05,
  mid: 0.02,
  long_tail: 0.01,
};

export const freshnessRankingWeights = {
  relevance: 0.6,
  freshness: 0.4,
};

export const tierRankingBoosts = {
  top: { withinHours: 2, multiplier: 0.3 },
  high: { withinHours: 4, multiplier: 0.2 },
  mid: { withinHours: 12, multiplier: 0.1 },
  long_tail: { withinHours: 0, multiplier: 0 },
};

export const newDiscoveryBoost = {
  withinHours: 48,
  multiplier: 0.15,
};

export const defaultSyncTierLimits = {
  top: 250,
  high: 500,
  mid: 1500,
};
