import {
  defaultSyncTierLimits,
  freshnessLambdas,
  freshnessRankingWeights,
  newDiscoveryBoost,
  syncTierAliases,
  syncTierIntervalsMs,
  syncTiers,
  tierRankingBoosts,
} from "../src/lib/freshnessConfig.js";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateMs(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isoTimestamp(value) {
  const time = dateMs(value);
  return time === null ? null : new Date(time).toISOString();
}

export function normalizeSyncTier(value) {
  const tier = String(value || "").toLowerCase();
  if (syncTiers.includes(tier)) return tier;
  return syncTierAliases[tier] || null;
}

function syncTierLimit(envName, fallback) {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function inferSyncTier(agent, index = 0) {
  const explicit = normalizeSyncTier(agent?.sync_tier || agent?.syncTier);
  if (explicit) return explicit;

  const topLimit = syncTierLimit("APPURDEX_SYNC_TOP_LIMIT", defaultSyncTierLimits.top);
  const highLimit = syncTierLimit("APPURDEX_SYNC_HIGH_LIMIT", syncTierLimit("APPURDEX_SYNC_IMPORTANT_LIMIT", defaultSyncTierLimits.high));
  const midLimit = syncTierLimit("APPURDEX_SYNC_MID_LIMIT", defaultSyncTierLimits.mid);

  if (index < topLimit) return "top";
  if (index < highLimit) return "high";
  if (index < midLimit) return "mid";
  return "long_tail";
}

export function nextSyncAt(syncTier, fromTime = Date.now()) {
  const tier = normalizeSyncTier(syncTier) || "long_tail";
  return new Date(fromTime + (syncTierIntervalsMs[tier] || syncTierIntervalsMs.long_tail)).toISOString();
}

export function lastSyncedAtForAgent(agent, db, slug) {
  const sourceCheck = db?.sourceChecks?.[slug];
  const githubMetric = db?.githubMetrics?.[slug];
  return isoTimestamp(
    agent?.last_synced_at
    || agent?.lastSyncedAt
    || sourceCheck?.lastCheckedAt
    || githubMetric?.lastVerifiedAt
    || agent?.workerCheckedAt
    || agent?.discovered_at
    || agent?.discoveredAt
    || agent?.discovery?.discoveredAt
    || agent?.lastCuratedAt,
  );
}

export function discoveredAtForAgent(agent) {
  return isoTimestamp(agent?.discovered_at || agent?.discoveredAt || agent?.discovery?.discoveredAt);
}

export function syncAgeLabel(lastSyncedAt, nowTime = Date.now()) {
  const syncedAt = dateMs(lastSyncedAt);
  if (syncedAt === null) return "Not synced";
  const diffMs = Math.max(0, nowTime - syncedAt);
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function syncAgeTone(lastSyncedAt, nowTime = Date.now()) {
  const syncedAt = dateMs(lastSyncedAt);
  if (syncedAt === null) return "unknown";
  const hours = Math.max(0, (nowTime - syncedAt) / 3600000);
  if (hours > 24) return "muted";
  if (hours > 6) return "stale";
  return "fresh";
}

function logScore(value, scale = 10) {
  const number = finiteNumber(value);
  return number && number > 0 ? Math.log1p(number) * scale : 0;
}

export function relevanceScoreForAgent(agent, db, slug) {
  const githubMetric = db?.githubMetrics?.[slug] || agent?.githubMetric || {};
  const adoption = agent?.adoptionMetrics || {};
  const ecosystem = agent?.ecosystemHealth || {};
  const rankPriority = finiteNumber(agent?.marketPosition?.rankPriority);
  const curatedScore = finiteNumber(agent?.relevance_score || agent?.relevanceScore || agent?.score || agent?.trustScore) || 0;
  const marketScore = rankPriority && rankPriority > 0 ? Math.max(0, 110 - Math.min(rankPriority, 100)) : 0;
  const engagementScore = [
    logScore(githubMetric.stars ?? ecosystem.repoStars ?? agent?.stars, 8),
    logScore(githubMetric.forks ?? ecosystem.repoForks ?? agent?.forks, 4),
    logScore(githubMetric.commitCount30d, 3),
    logScore(adoption.packageDownloadsMonthly, 2),
    finiteNumber(githubMetric.trend7dPct) ? Math.max(0, Number(githubMetric.trend7dPct)) : 0,
  ].reduce((sum, value) => sum + value, 0);
  return Number(Math.max(1, curatedScore, marketScore, engagementScore).toFixed(4));
}

export function freshnessScoreForAgent({ agent, db, slug, syncTier, lastSyncedAt, nowTime = Date.now() }) {
  const syncedAt = dateMs(lastSyncedAt);
  if (syncedAt === null) return 0;
  const tier = normalizeSyncTier(syncTier) || "long_tail";
  const lambda = freshnessLambdas[tier] ?? freshnessLambdas.long_tail;
  const hoursSinceLastSync = Math.max(0, (nowTime - syncedAt) / 3600000);
  const baseScore = relevanceScoreForAgent(agent, db, slug) + 1;
  return Number((baseScore * Math.exp(-lambda * hoursSinceLastSync)).toFixed(4));
}

export function finalRankForAgent({ relevanceScore, freshnessScore, syncTier, lastSyncedAt, discoveredAt, nowTime = Date.now() }) {
  let finalRank = (relevanceScore * freshnessRankingWeights.relevance) + (freshnessScore * freshnessRankingWeights.freshness);
  const syncedAt = dateMs(lastSyncedAt);
  const tier = normalizeSyncTier(syncTier) || "long_tail";
  const tierBoost = tierRankingBoosts[tier] || null;
  if (syncedAt !== null && tierBoost?.multiplier) {
    const hoursSinceLastSync = Math.max(0, (nowTime - syncedAt) / 3600000);
    if (hoursSinceLastSync <= tierBoost.withinHours) finalRank *= (1 + tierBoost.multiplier);
  }

  const discoveredTime = dateMs(discoveredAt);
  if (discoveredTime !== null) {
    const hoursSinceDiscovery = Math.max(0, (nowTime - discoveredTime) / 3600000);
    if (hoursSinceDiscovery <= newDiscoveryBoost.withinHours) finalRank *= (1 + newDiscoveryBoost.multiplier);
  }

  return Number(finalRank.toFixed(4));
}

export function applyFreshnessToAgent(agent, db, index = 0, nowTime = Date.now()) {
  const slug = agent.slug || agent.id;
  const syncTier = inferSyncTier(agent, index);
  const lastSyncedAt = lastSyncedAtForAgent(agent, db, slug);
  const discoveredAt = discoveredAtForAgent(agent);
  const relevanceScore = relevanceScoreForAgent(agent, db, slug);
  const freshnessScore = freshnessScoreForAgent({ agent, db, slug, syncTier, lastSyncedAt, nowTime });
  const finalRank = finalRankForAgent({ relevanceScore, freshnessScore, syncTier, lastSyncedAt, discoveredAt, nowTime });
  return {
    ...agent,
    sync_tier: syncTier,
    last_synced_at: lastSyncedAt,
    discovered_at: discoveredAt,
    relevance_score: relevanceScore,
    freshness_score: freshnessScore,
    final_rank: finalRank,
    sync_age_label: syncAgeLabel(lastSyncedAt, nowTime),
    sync_age_tone: syncAgeTone(lastSyncedAt, nowTime),
  };
}

export function applyFreshnessToDb(db, nowTime = Date.now()) {
  const agents = Array.isArray(db.agents) ? db.agents : [];
  return {
    ...db,
    agents: agents.map((agent, index) => applyFreshnessToAgent(agent, db, index, nowTime)),
    freshnessComputedAt: new Date(nowTime).toISOString(),
  };
}
