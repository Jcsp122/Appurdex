import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackedTools } from "../src/data/trackedTools.js";
import { modelPricingCatalog, modelPricingRefsForAgent, modelPricingSources } from "../src/data/modelPricing.js";
import { apiPlans, buildSourceUrls, logoUrlForTool, normalizePricing, slugify } from '../src/lib/agentModel.js';
import { fieldDataPolicies, freeDataSources } from '../src/data/sourceCatalog.js';
import { applyFreshnessToAgent, applyFreshnessToDb, discoveredAtForAgent, inferSyncTier, syncAgeLabel, syncAgeTone } from "./freshness.mjs";
import { changeTypeForReviewItem } from "./change-types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "appurdex-db.json");

function now() {
  return new Date().toISOString();
}

function seedAgent(tool) {
  const slug = tool.slug || slugify(tool.id || tool.name);
  return {
    ...tool,
    slug,
    hasPublicRepo: tool.hasPublicRepo ?? Boolean(tool.githubRepo),
    sync_tier: inferSyncTier(tool),
    last_synced_at: tool.last_synced_at || tool.lastSyncedAt || tool.lastCuratedAt || tool.discovery?.discoveredAt || tool.discoveredAt || null,
    discovered_at: discoveredAtForAgent(tool),
    logoUrl: logoUrlForTool(tool),
    sourceUrls: buildSourceUrls(tool),
    verification: {
      status: tool.lastCuratedAt ? "source_verified" : "unverified",
      sourceVerifiedAt: tool.lastCuratedAt || null,
      vendorVerifiedAt: null,
      method: tool.githubRepo ? "public_repository" : "official_source_link",
    },
    provenance: {
      fieldSource: tool.sourceType || "Official source",
      resaleAllowed: true,
      attributionRequired: false,
      licenseNotes: "Appurdex sells derived verification metadata, source links, and freshness signals; do not copy licensed third-party datasets into this record.",
    },
    monetization: {
      apiVisible: true,
      vendorClaimEnabled: true,
      paidProfileEnabled: false,
    },
  };
}

function mergeSourceUrls(seedUrls = [], currentUrls = []) {
  const sourcesByKey = new Map();
  seedUrls.forEach((source) => {
    if (source?.url) sourcesByKey.set(source.kind || source.url, source);
  });
  currentUrls.forEach((source) => {
    if (source?.url) sourcesByKey.set(source.kind || source.url, source);
  });
  return [...sourcesByKey.values()];
}

function mergeModelPricing(db) {
  const currentById = new Map((db.modelPricing || []).map((entry) => [entry.id, entry]));
  const merged = modelPricingCatalog.map((entry) => ({ ...entry, ...(currentById.get(entry.id) || {}) }));
  const seededIds = new Set(merged.map((entry) => entry.id));
  const extraReviewedRows = (db.modelPricing || []).filter((entry) => entry?.id && !seededIds.has(entry.id));
  return [...merged, ...extraReviewedRows];
}

export function publicModelPricingEntry(entry, db) {
  const sourceCheck = db.modelPricingSourceChecks?.[entry.sourceId] || null;
  const lastSyncedAt = sourceCheck?.last_synced_at || sourceCheck?.lastSyncedAt || entry.last_synced_at || null;
  return {
    ...entry,
    last_synced_at: lastSyncedAt,
    lastSyncedAt,
    sync_age_label: syncAgeLabel(lastSyncedAt),
    syncAgeLabel: syncAgeLabel(lastSyncedAt),
    sync_age_tone: syncAgeTone(lastSyncedAt),
    syncAgeTone: syncAgeTone(lastSyncedAt),
    sourceCheck,
  };
}

function initialDb() {
  return {
    schemaVersion: 1,
    createdAt: now(),
    updatedAt: now(),
    agents: trackedTools.map(seedAgent),
    sourceChecks: {},
    githubMetrics: {},
    githubMetricErrors: {},
    reviewQueue: [],
    metricSnapshots: [],
    suggestions: [],
    vendorClaims: [],
    apiKeys: [],
    workerRuns: [],
    apiPlans,
    modelPricing: modelPricingCatalog,
    modelPricingSources,
    modelPricingSourceChecks: {},
    freeDataSources,
    fieldDataPolicies,
  };
}

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function mergeSeedAgents(db) {
  const existingBySlug = new Map((db.agents || []).map((agent) => [agent.slug || slugify(agent.id || agent.name), agent]));
  const mergedAgents = trackedTools.map((tool, index) => {
    const seeded = seedAgent(tool);
    const current = existingBySlug.get(seeded.slug);
    const merged = current ? { ...seeded, ...current, sourceUrls: mergeSourceUrls(seeded.sourceUrls, current.sourceUrls || []) } : seeded;
    return { ...merged, logoUrl: merged.logoUrl || logoUrlForTool(merged), sync_tier: merged.sync_tier || inferSyncTier(merged, index) };
  });

  return {
    ...initialDb(),
    ...db,
    agents: mergedAgents,
    sourceChecks: db.sourceChecks || {},
    githubMetrics: db.githubMetrics || {},
    githubMetricErrors: db.githubMetricErrors || {},
    reviewQueue: db.reviewQueue || [],
    metricSnapshots: db.metricSnapshots || [],
    suggestions: db.suggestions || [],
    vendorClaims: db.vendorClaims || [],
    apiKeys: db.apiKeys || [],
    workerRuns: db.workerRuns || [],
    apiPlans,
    modelPricing: mergeModelPricing(db),
    modelPricingSources,
    modelPricingSourceChecks: db.modelPricingSourceChecks || {},
    freeDataSources,
    fieldDataPolicies,
  };
}

async function readStoredDb() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const db = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    return mergeSeedAgents(db);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const db = initialDb();
    await writeDb(db);
    return db;
  }
}

export async function readDb() {
  return applyFreshnessToDb(await readStoredDb());
}

export async function writeDb(db) {
  await ensureDataDir();
  const agents = Array.isArray(db.agents)
    ? db.agents.map((agent) => {
      const { modelPricingSourceRefs, modelPricingCoverage, ...storedAgent } = agent;
      return { ...storedAgent, logoUrl: storedAgent.logoUrl || logoUrlForTool(storedAgent) };
    })
    : [];
  const next = { ...db, agents, updatedAt: now() };
  await fs.writeFile(dbPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function textList(value) {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" ? item : Object.values(item || {})).filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function searchKeywordsForAgent(agent) {
  return uniqueStrings([
    ...(Array.isArray(agent.searchKeywords) ? agent.searchKeywords : []),
    agent.id,
    agent.slug,
    agent.name,
    agent.category,
    agent.ecosystem,
    agent.vendorName,
    agent.companyName,
    agent.company,
    agent.githubRepo,
    ...(agent.category === "CLI-native" ? ["cli agent", "terminal agent", "coding agent"] : []),
    ...(agent.category === "IDE-attached" ? ["ide assistant", "editor assistant", "coding assistant"] : []),
    ...(agent.category === "App builder" ? ["ai app builder", "vibe coding", "prompt to app"] : []),
    ...(agent.category === "MCP server" ? ["mcp", "model context protocol", "agent infrastructure"] : []),
    ...textList(agent.integrations),
    ...textList(agent.discovery?.topics),
    ...textList(agent.modelSupport?.providers),
  ]);
}

function useCaseWeightForAgent(agent) {
  if (agent.useCaseWeight && typeof agent.useCaseWeight === "object") return agent.useCaseWeight;
  const text = [agent.name, agent.description, agent.category, agent.ecosystem, agent.githubRepo, ...searchKeywordsForAgent(agent)].join(" ").toLowerCase();
  const weights = {};
  const rules = [
    ["Code generation", /code|coding|developer|software|repo|pull request|terminal|ide/],
    ["App building", /app builder|prompt to app|vibe|prototype|frontend|full-stack/],
    ["Data analysis", /data|analysis|analytics|notebook|research|retrieval/],
    ["Automation", /automation|workflow|agentic|orchestration|autonomous|task/],
    ["Agent infrastructure", /mcp|server|sdk|api|tool|integration|runtime/],
  ];
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) weights[label] = label === "Code generation" ? 1 : 0.8;
  }
  return weights;
}

function historyForAgent(agent, db, slug, pricing) {
  const sourceCheck = db.sourceChecks?.[slug] || null;
  const githubMetric = db.githubMetrics?.[slug] || null;
  const snapshots = (db.metricSnapshots || []).filter((snapshot) => snapshot.agentSlug === slug);
  return {
    pricingHistory: pricing.verifiedAt || agent.lastCuratedAt ? [{ value: pricing.display, changedAt: pricing.verifiedAt || agent.lastCuratedAt, sourceUrl: pricing.sourceUrl || agent.pricingUrl || null }] : [],
    rankingHistory: snapshots.map((snapshot) => ({ rank: snapshot.finalRank || null, date: snapshot.checkedAt })).filter((row) => row.date && row.rank !== null),
    repoStarHistory: snapshots.map((snapshot) => ({ stars: snapshot.github?.stars ?? null, date: snapshot.checkedAt })).filter((row) => typeof row.stars === "number" && row.date),
    freshnessHistory: [
      sourceCheck ? { status: sourceCheck.status || "unknown", date: sourceCheck.lastCheckedAt || sourceCheck.last_synced_at || null } : null,
      agent.last_synced_at ? { status: agent.sync_age_tone || "synced", date: agent.last_synced_at } : null,
      githubMetric?.lastVerifiedAt ? { status: githubMetric.ok ? "github_verified" : "github_error", date: githubMetric.lastVerifiedAt } : null,
    ].filter((row) => row?.date),
  };
}

function changeLogForAgent(agent, db, slug) {
  const rows = [];
  for (const item of db.reviewQueue || []) {
    if (item.agentSlug && item.agentSlug !== slug) continue;
    const type = String(item.type || "");
    if (!/(source_changed|source_check_failed|model_pricing_source_changed|model_pricing_source_check_failed|automation_gap|community_suggestion|vendor_claim|access_changed|model_support_changed|pricing_changed|tool_added|freshness_changed)/.test(type)) continue;
    const changeType = changeTypeForReviewItem(item);
    rows.push({
      productId: item.agentSlug || slug,
      field: item.field || type,
      oldValue: item.oldValue ?? null,
      newValue: item.newValue ?? item.detail ?? item.title ?? null,
      detectedAt: item.detectedAt || item.updatedAt || item.createdAt || null,
      changeType,
      sourceUrl: item.sourceUrl || null,
      status: item.status || "pending",
    });
  }
  return rows.filter((row) => row.detectedAt).slice(0, 50);
}

function vendorObjectForAgent(agent) {
  const integrations = Array.isArray(agent.integrations) ? agent.integrations : [];
  return {
    name: agent.vendorName || agent.companyName || agent.company || agent.maintainerName || null,
    foundingInfo: agent.foundedAt || agent.launchDate || null,
    integrations,
    complianceCerts: Array.isArray(agent.complianceCerts) ? agent.complianceCerts : [],
    website: agent.vendorWebsite || null,
    sourceUrl: agent.vendorSourceUrl || null,
  };
}

function appurScoreForAgent(agent, db, slug) {
  const github = db.githubMetrics?.[slug] || null;
  const freshness = typeof agent.freshness_score === "number" ? agent.freshness_score : 0;
  const relevance = typeof agent.relevance_score === "number" ? agent.relevance_score : 0;
  const stars = typeof github?.stars === "number" ? Math.min(35, Math.log10(github.stars + 1) * 7) : 0;
  const trend = typeof github?.trend7dPct === "number" ? Math.max(0, Math.min(15, github.trend7dPct + 7.5)) : 0;
  const score = Math.round(Math.min(100, freshness * 0.35 + relevance * 0.25 + stars + trend));
  return { score, components: { freshness, relevance, stars, trend }, source: "Derived from Appurdex freshness, relevance, and retained repo snapshots." };
}
export function publicAgent(agent, db) {
  const slug = agent.slug || slugify(agent.id || agent.name);
  const index = (db.agents || []).findIndex((item) => (item.slug || item.id) === slug);
  const freshAgent = applyFreshnessToAgent(agent, db, index < 0 ? 0 : index);
  const pricing = normalizePricing(freshAgent);
  const pricingSummary = freshAgent.pricingSummary || freshAgent.price || freshAgent.pricing?.display || pricing.display;
  const sourceCheck = db.sourceChecks?.[slug] || null;
  const githubMetric = db.githubMetrics?.[slug] || null;
  const verificationStatus = sourceCheck?.status || freshAgent.verification?.status || (freshAgent.lastCuratedAt ? "source_verified" : "unverified");
  return {
    id: freshAgent.id || slug,
    stableId: freshAgent.id || slug,
    slug,
    searchKeywords: searchKeywordsForAgent(freshAgent),
    useCaseWeight: useCaseWeightForAgent(freshAgent),
    name: freshAgent.name,
    category: freshAgent.category,
    ecosystem: freshAgent.ecosystem,
    description: freshAgent.description,
    pricingTier: freshAgent.pricingTier || pricing.tier,
    pricingType: freshAgent.pricingType || freshAgent.pricing?.type || pricing.type,
    pricingSummary,
    price: pricingSummary,
    pricing,
    trustScore: freshAgent.trustScore || null,
    website: freshAgent.website,
    githubRepo: freshAgent.githubRepo,
    hasPublicRepo: freshAgent.hasPublicRepo ?? Boolean(freshAgent.githubRepo),
    logoUrl: freshAgent.logoUrl || null,
    licenseType: freshAgent.licenseType,
    vendorId: freshAgent.vendorId || null,
    vendorName: freshAgent.vendorName || freshAgent.companyName || freshAgent.company || null,
    vendorWebsite: freshAgent.vendorWebsite || null,
    vendorSourceUrl: freshAgent.vendorSourceUrl || null,
    vendorSourceLabel: freshAgent.vendorSourceLabel || null,
    vendor: vendorObjectForAgent(freshAgent),
    maintainerName: freshAgent.maintainerName || freshAgent.companyName || freshAgent.company || null,
    foundedAt: freshAgent.foundedAt || freshAgent.launchDate || null,
    modelSupport: freshAgent.modelSupport || null,
    modelPricingRefs: modelPricingRefsForAgent(freshAgent).modelPricingRefs,
    modelPricingSourceRefs: modelPricingRefsForAgent(freshAgent).modelPricingSourceRefs,
    modelPricingCoverage: modelPricingRefsForAgent(freshAgent).modelPricingCoverage,
    marketPosition: freshAgent.marketPosition || null,
    sourceUrl: freshAgent.sourceUrl,
    sourceLabel: freshAgent.sourceLabel,
    sourceType: freshAgent.sourceType,
    sourceUrls: freshAgent.sourceUrls,
    socialLinks: freshAgent.socialLinks,
    socials: freshAgent.socials,
    twitterUrl: freshAgent.twitterUrl,
    xUrl: freshAgent.xUrl,
    linkedinUrl: freshAgent.linkedinUrl,
    youtubeUrl: freshAgent.youtubeUrl,
    ytUrl: freshAgent.ytUrl,
    instagramUrl: freshAgent.instagramUrl,
    statusNote: freshAgent.statusNote,
    lastCuratedAt: freshAgent.lastCuratedAt,
    last_synced_at: freshAgent.last_synced_at,
    lastSyncedAt: freshAgent.last_synced_at,
    sync_tier: freshAgent.sync_tier,
    syncTier: freshAgent.sync_tier,
    freshness_score: freshAgent.freshness_score,
    freshnessScore: freshAgent.freshness_score,
    relevance_score: freshAgent.relevance_score,
    relevanceScore: freshAgent.relevance_score,
    final_rank: freshAgent.final_rank,
    finalRank: freshAgent.final_rank,
    discovered_at: freshAgent.discovered_at,
    discoveredAt: freshAgent.discovered_at,
    sync_age_label: freshAgent.sync_age_label,
    syncAgeLabel: freshAgent.sync_age_label,
    sync_age_tone: freshAgent.sync_age_tone,
    syncAgeTone: freshAgent.sync_age_tone,
    provenance: freshAgent.provenance,
    monetization: freshAgent.monetization,
    pricingPlans: freshAgent.pricingPlans,
    benchmarks: freshAgent.benchmarks,
    capabilityMetrics: freshAgent.capabilityMetrics,
    operationalMetrics: freshAgent.operationalMetrics,
    ecosystemHealth: freshAgent.ecosystemHealth,
    adoptionMetrics: freshAgent.adoptionMetrics,
    fieldVerification: freshAgent.fieldVerification,
    sourceCheck,
    githubMetric,
    verifiedAt: freshAgent.verifiedAt || freshAgent.verification?.sourceVerifiedAt || freshAgent.lastCuratedAt || sourceCheck?.lastCheckedAt || null,
    verificationStatus,
    history: historyForAgent(freshAgent, db, slug, pricing),
    changeLog: changeLogForAgent(freshAgent, db, slug),
    appurScore: appurScoreForAgent(freshAgent, db, slug),
    dataSourcePolicy: fieldDataPolicies,
  };
}

export async function refreshFreshnessScores() {
  const db = await readStoredDb();
  const beforeBySlug = new Map((db.agents || []).map((agent) => [agent.slug || slugify(agent.id || agent.name), agent]));
  const refreshed = applyFreshnessToDb(db);
  const reviewQueue = [...(refreshed.reviewQueue || [])];
  let freshnessChanges = 0;
  for (const agent of refreshed.agents || []) {
    const slug = agent.slug || slugify(agent.id || agent.name);
    const before = beforeBySlug.get(slug);
    const oldTone = before?.sync_age_tone || before?.syncAgeTone;
    const newTone = agent.sync_age_tone || agent.syncAgeTone;
    if (oldTone !== "fresh" || newTone !== "stale") continue;
    freshnessChanges += 1;
    reviewQueue.unshift(makeReviewItem(
      "freshness_changed",
      slug,
      `${agent.name || slug} freshness changed`,
      "Tool freshness moved from Fresh to Stale.",
      agent.sourceUrl || agent.website || agent.sourceUrls?.[0]?.url || null,
      "pending",
      { field: "freshness", oldValue: "Fresh", newValue: "Stale", detectedAt: refreshed.freshnessComputedAt, changeType: "freshness" },
    ));
  }
  refreshed.reviewQueue = reviewQueue;
  await writeDb(refreshed);
  return {
    refreshedAt: refreshed.freshnessComputedAt,
    checked: refreshed.agents.length,
    freshnessChanges,
  };
}
export function findAgent(db, slugOrId) {
  const key = slugify(slugOrId);
  return db.agents.find((agent) => agent.slug === key || agent.id === key);
}

export function makeReviewItem(type, agentSlug, title, detail, sourceUrl, status = "pending", metadata = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    agentSlug,
    title,
    detail,
    sourceUrl,
    field: metadata.field || type,
    oldValue: metadata.oldValue ?? null,
    newValue: metadata.newValue ?? detail ?? title ?? null,
    detectedAt: metadata.detectedAt || now(),
    changeType: metadata.changeType || changeTypeForReviewItem({ type, field: metadata.field, title, detail }),
    status,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function createApiKeyRecord({ ownerName, ownerEmail, planId }) {
  const plan = apiPlans.find((item) => item.id === planId) || apiPlans.find((item) => item.id === "pro") || apiPlans[0];
  return {
    id: crypto.randomUUID(),
    token: `appx_${crypto.randomBytes(24).toString("hex")}`,
    tokenPreview: null,
    ownerName: ownerName || "Unassigned",
    ownerEmail: ownerEmail || "",
    planId: plan.id,
    planName: plan.name,
    status: "active",
    createdAt: now(),
    lastUsedAt: null,
  };
}

export function maskApiKey(record) {
  return {
    ...record,
    token: undefined,
    tokenPreview: record.tokenPreview || `${record.token?.slice(0, 8) || "appx"}...${record.token?.slice(-4) || ""}`,
  };
}

export function requireApiKey(db, request) {
  const token = request.headers["x-appurdex-api-key"] || request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "Missing Appurdex API key." };
  const record = db.apiKeys.find((item) => item.token === token && item.status === "active");
  if (!record) return { ok: false, status: 403, error: "Invalid or inactive Appurdex API key." };
  record.lastUsedAt = now();
  return { ok: true, record };
}


