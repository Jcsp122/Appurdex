import { modelPricingCatalog, modelPricingRefsForAgent, modelPricingSources } from '../data/modelPricing.js';
import { fieldDataPolicies, freeDataSources } from '../data/sourceCatalog.js';
import { vendorProductMap } from '../data/vendorCatalog.js';
import { productUseCaseTags } from '../data/useCaseProductTags.js';
import { normalizeUseCases } from '../data/useCaseTaxonomy.js';

export const supportedLanguages = ['en', 'ja', 'ko', 'zh'];


export const priceRangeOptions = [
  { id: 'free', label: '$0 / free', min: 0, max: 0, sortOrder: 0 },
  { id: 'under10', label: '$1-$10/mo', min: 1, max: 10, sortOrder: 10 },
  { id: 'under20', label: '$11-$20/mo', min: 11, max: 20, sortOrder: 20 },
  { id: 'under50', label: '$21-$50/mo', min: 21, max: 50, sortOrder: 50 },
  { id: 'under100', label: '$51-$100/mo', min: 51, max: 100, sortOrder: 100 },
  { id: 'under200', label: '$101-$200/mo', min: 101, max: 200, sortOrder: 200 },
  { id: 'over200', label: '$201+/mo', min: 201, max: Infinity, sortOrder: 201 },
  { id: 'enterprise', label: 'Enterprise/custom', enterprise: true, sortOrder: 900 },
  { id: 'unknown', label: 'Unknown/not disclosed', unknown: true, sortOrder: 999 },
];

function isGithubUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'github.com' || hostname === 'www.github.com';
  } catch {
    return false;
  }
}

function primaryWebsiteUrl(tool) {
  return [tool.website, tool.sourceUrl].find((url) => url && !isGithubUrl(url)) || tool.website || tool.sourceUrl;
}

function githubOwnerFromTool(tool) {
  if (tool.githubRepo) return String(tool.githubRepo).split('/')[0] || null;
  const candidates = [tool.website, tool.sourceUrl, tool.vendorWebsite, tool.vendorSourceUrl];
  for (const candidate of candidates) {
    try {
      const parsed = candidate ? new URL(candidate) : null;
      if (parsed && (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com')) {
        return parsed.pathname.split('/').filter(Boolean)[0] || null;
      }
    } catch {
      // Ignore invalid source URLs and continue through the remaining sources.
    }
  }
  return null;
}

export function logoUrlForTool(tool) {
  if (tool.logoUrl) return tool.logoUrl;
  const websiteUrl = primaryWebsiteUrl(tool);
  try {
    const parsed = websiteUrl ? new URL(websiteUrl) : null;
    if (parsed && !isGithubUrl(parsed.href)) return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    // Invalid or missing URLs should not produce fabricated logo values.
  }
  const githubOwner = githubOwnerFromTool(tool);
  return githubOwner ? `https://github.com/${githubOwner}.png?size=64` : null;
}

export const apiPlans = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    apiMonthlyLimit: 0,
    compareLimit: 2,
    apiAccess: false,
    freshnessTier: 'Default freshness',
    note: 'Public directory and limited compare. Subscriber API keys start on Starter.',
    entitlements: ['Public listings', 'Limited compare', 'Usage dashboard', 'Visible source and unknown-state labels'],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 19.99,
    apiMonthlyLimit: 5000,
    compareLimit: null,
    apiAccess: true,
    freshnessTier: 'Default freshness',
    stripeMonthlyEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    stripeAnnualEnv: 'STRIPE_PRICE_STARTER_ANNUAL',
    note: '5,000 API requests per month for catalog, pricing, source, and category endpoints.',
    entitlements: ['Subscriber API keys', 'Verified pricing/source fields', 'Watchlists and saved comparisons'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 69.99,
    apiMonthlyLimit: 50000,
    compareLimit: null,
    apiAccess: true,
    freshnessTier: 'Default freshness',
    stripeMonthlyEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    stripeAnnualEnv: 'STRIPE_PRICE_PRO_ANNUAL',
    note: '50,000 API requests per month, historical data, CSV export, source-change alerts, and AppurScore access.',
    entitlements: ['Historical data', 'CSV export', 'Source-change alerts', 'AppurScore'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    apiMonthlyLimit: null,
    compareLimit: null,
    apiAccess: true,
    freshnessTier: 'Default freshness',
    stripeMonthlyEnv: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    stripeAnnualEnv: 'STRIPE_PRICE_ENTERPRISE_ANNUAL',
    note: 'Custom request volume, team access, support, SLA, and commercial export terms.',
    entitlements: ['Custom API volume', 'Bulk exports', 'White-label reports', 'Custom support terms'],
  },
  { id: 'admin', name: 'Admin', priceMonthly: null, apiMonthlyLimit: null, compareLimit: null, apiAccess: true, adminBypass: true, freshnessTier: 'Default freshness' },
];

const categoryLabels = {
  'Coding agent': 'Coding Agent',
  'IDE assistant': 'IDE Assistant',
  'CLI agent': 'CLI Agent',
  'Autonomous agent': 'Autonomous Agent',
  'App builder': 'App Builder',
  'MCP server': 'MCP Server',
};

function sourceLabelFromUrl(url, fallback = 'Official source') {
  if (!url) return fallback;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const first = host.split('.')[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) + ' source' : fallback;
  } catch {
    return fallback;
  }
}

function pricingPlanTexts(agent) {
  const plans = Array.isArray(agent?.pricingPlans) ? agent.pricingPlans : [];
  return plans.flatMap((plan) => [
    plan?.name,
    plan?.price,
    plan?.billingPeriod,
    plan?.limits,
    plan?.requestLimit,
    plan?.rateLimit,
    plan?.messageLimit,
    plan?.tokenLimit,
    plan?.credits,
    plan?.notes,
  ]).filter(Boolean).map(String);
}

function pricingTextsForAgent(agent) {
  return [agent?.pricingTier, agent?.price, agent?.pricing?.display, agent?.pricing?.tier, ...pricingPlanTexts(agent)]
    .filter(Boolean)
    .map(String);
}

export function standardizePricingAmount(value) {
  if (typeof value !== 'string') return value || '';
  let text = value.trim();
  if (!text) return '';
  text = text.replace(/\s*\/\s*(?:mo|month|monthly|yr|year|annual|annually)\b/gi, '');
  text = text.replace(/\b(?:monthly|annually)\b/gi, '');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+([;,])/g, '$1');
  text = text.replace(/;\s*/g, '; ');
  text = text.trim();
  if (/^from\s+\$/i.test(text)) text = text.replace(/^from/i, 'From');
  const leadingAmount = text.match(/^\$[\d,]+(?:\.\d+)?(?:\s*[kKmM])?/);
  if (leadingAmount) return 'From ' + leadingAmount[0].replace(/\s+/g, '');
  return text;
}

function moneyValuesFromText(text) {
  return [...String(text || '').matchAll(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(?:\s*([kKmM]))?(?:\s*(?:\/|per)\s*(mo|month|monthly|yr|year|annual|annually))?/g)]
    .map((match) => {
      let value = Number(match[1].replace(/,/g, ''));
      if (!Number.isFinite(value)) return null;
      const multiplier = match[2]?.toLowerCase();
      if (multiplier === 'k') value *= 1000;
      if (multiplier === 'm') value *= 1000000;
      return { value, period: match[3]?.toLowerCase() || null };
    })
    .filter(Boolean);
}

function monthlyPriceFromPlan(plan) {
  const priceText = String(plan?.price || '');
  const prices = moneyValuesFromText(priceText);
  if (!prices.length) return [];
  const billingPeriod = String(plan?.billingPeriod || '').toLowerCase();
  const hasMonthlyAndAnnual = /month|monthly/.test(billingPeriod) && /year|annual|annum|yr/.test(billingPeriod);
  const smallest = Math.min(...prices.map(({ value }) => value));
  return prices.map(({ value, period }) => {
    if (['yr', 'year', 'annual', 'annually'].includes(period)) return value / 12;
    if (['mo', 'month', 'monthly'].includes(period)) return value;
    if (hasMonthlyAndAnnual && prices.length > 1 && value >= smallest * 6) return value / 12;
    return value;
  });
}

function monthlyPricesForAgent(agent) {
  const plans = Array.isArray(agent?.pricingPlans) ? agent.pricingPlans : [];
  const planPrices = plans.flatMap(monthlyPriceFromPlan);
  const summaryTexts = [agent?.pricingTier, agent?.price, agent?.pricing?.display, agent?.pricing?.tier]
    .filter(Boolean)
    .map(String);
  const loosePrices = summaryTexts.flatMap((text) => moneyValuesFromText(text).map(({ value, period }) => (
    ['yr', 'year', 'annual', 'annually'].includes(period) ? value / 12 : value
  )));
  return [...planPrices, ...loosePrices].filter((value) => Number.isFinite(value));
}

function hasFreePricing(agent) {
  const text = pricingTextsForAgent(agent).join(' ');
  return /(^|\b)(free|open source|\$\s*0)(\b|$)/i.test(text);
}

function hasContactOrUnknownPricing(agent) {
  const text = pricingTextsForAgent(agent).join(' ');
  return /enterprise|contact|custom|sales|unknown|not disclosed/i.test(text);
}

function usablePricingText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^(unknown|n\/a|na|not available|not disclosed|undisclosed|tbd|null|undefined)$/i.test(text)) return null;
  return text;
}

function sourceBackedPricingLabel(agent) {
  const plans = Array.isArray(agent?.pricingPlans) ? agent.pricingPlans : [];
  const candidates = [
    agent?.pricingSummary,
    agent?.price,
    agent?.pricing?.display,
    agent?.pricing?.tier,
    agent?.pricingTier,
    ...plans.flatMap((plan) => [plan?.price, plan?.billingPeriod]).filter(Boolean),
  ];
  return candidates.map(usablePricingText).find(Boolean) || null;
}

function pricingTypeFromText(text) {
  if (!text) return 'Unknown';
  if (/^open source$/i.test(text) || /(^|\b)(free|\$\s*0)(\b|$)/i.test(text)) return 'Free';
  if (/enterprise|contact|custom|sales/i.test(text)) return 'Enterprise';
  if (/freemium|free.+paid|free.+usage|free.+credit/i.test(text)) return 'Freemium';
  return 'Paid';
}

function formatSummaryAmount(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = value >= 1000 ? Math.round(value) : value;
  const display = new Intl.NumberFormat('en', { maximumFractionDigits: rounded >= 10 ? 0 : rounded % 1 ? 2 : 0 }).format(rounded);
  return '$' + display;
}

export function pricingSummaryForAgent(agent) {
  const plans = Array.isArray(agent?.pricingPlans) ? agent.pricingPlans : [];
  const texts = pricingTextsForAgent(agent).join(' ');
  const tier = String(agent?.pricingTier || '').trim();
  const hasFree = hasFreePricing(agent);
  const prices = monthlyPricesForAgent(agent).filter((value) => value > 0);
  const cheapest = prices.length ? Math.min(...prices) : null;
  const amount = cheapest ? formatSummaryAmount(cheapest) + '/mo' : null;
  const isEnterprise = /enterprise|contact|custom|sales/i.test(texts || tier);
  const isUnknown = !texts || /unknown|not disclosed/i.test(texts);
  const fallbackLabel = sourceBackedPricingLabel(agent);
  const shouldPreferExplicitTier = fallbackLabel === usablePricingText(tier)
    && !moneyValuesFromText(fallbackLabel).length
    && !/^(open source|free|unknown)$/i.test(fallbackLabel)
    && !/enterprise|contact|custom|sales/i.test(fallbackLabel);

  if (shouldPreferExplicitTier) return { label: fallbackLabel, type: pricingTypeFromText(fallbackLabel) };
  if (hasFree && amount) return { label: 'Free + ' + amount, type: 'Freemium' };
  if (hasFree && /usage|credit|varies|usage-based/i.test(texts)) return { label: 'Free + usage-based', type: 'Freemium' };
  if (hasFree || /^open source$/i.test(tier)) return { label: 'Free', type: 'Free' };
  if (amount) return { label: 'From ' + amount, type: 'Paid' };
  if (isEnterprise) return { label: 'Enterprise', type: 'Enterprise' };
  if (!plans.length && isUnknown) return { label: 'Unknown', type: 'Unknown' };
  if (fallbackLabel) return { label: fallbackLabel, type: pricingTypeFromText(fallbackLabel) };
  return { label: 'Unknown', type: 'Unknown' };
}
export function agentMatchesPriceRange(agent, option) {
  if (!option) return true;
  const prices = monthlyPricesForAgent(agent);
  const hasPositivePrice = prices.some((value) => value > 0);
  if (option.unknown) return !hasPositivePrice && !hasFreePricing(agent) && hasContactOrUnknownPricing(agent);
  if (option.enterprise) return hasContactOrUnknownPricing(agent);
  if (option.min === 0 && option.max === 0) return hasFreePricing(agent);
  return prices.some((value) => value >= option.min && value <= option.max);
}

export function agentMatchesSelectedPriceRanges(agent, selectedIds) {
  if (!selectedIds?.length) return true;
  return selectedIds.some((id) => agentMatchesPriceRange(agent, priceRangeOptions.find((option) => option.id === id)));
}

export function agentMatchesMonthlyBudget(agent, rawBudget) {
  const range = rawBudget && typeof rawBudget === 'object' ? rawBudget : { max: rawBudget };
  const minText = String(range.min ?? '').trim();
  const maxText = String(range.max ?? '').trim();
  const hasMin = minText !== '';
  const hasMax = maxText !== '';
  if (!hasMin && !hasMax) return true;

  const min = hasMin ? Number(minText) : 0;
  const max = hasMax ? Number(maxText) : Infinity;
  if (!Number.isFinite(min) || min < 0 || max < 0 || (hasMax && !Number.isFinite(max))) return true;

  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (low <= 0 && hasFreePricing(agent)) return true;
  return monthlyPricesForAgent(agent).some((value) => value > 0 && value >= low && value <= high);
}

export function buildSourceUrls(tool) {
  const pricingSourceUrl = tool.pricingUrl || (Array.isArray(tool.pricingPlans) ? tool.pricingPlans.find((plan) => plan?.sourceUrl)?.sourceUrl : null);
  const benchmarkSourceUrl = tool.benchmarkUrl || (Array.isArray(tool.benchmarks) ? tool.benchmarks.find((row) => row?.sourceUrl)?.sourceUrl : null);
  const primarySourceUrl = primaryWebsiteUrl(tool);
  return [
    { kind: 'primary', url: primarySourceUrl, label: tool.sourceLabel || sourceLabelFromUrl(primarySourceUrl, 'Official source') },
    { kind: 'github', url: tool.githubRepo ? 'https://github.com/' + tool.githubRepo : null, label: 'GitHub repo' },
    { kind: 'pricing', url: pricingSourceUrl, label: tool.pricingLabel || sourceLabelFromUrl(pricingSourceUrl, 'Official pricing page') },
    { kind: 'status', url: tool.statusPageUrl, label: tool.statusPageLabel || 'Status source' },
    { kind: 'benchmark', url: benchmarkSourceUrl, label: tool.benchmarkLabel || sourceLabelFromUrl(benchmarkSourceUrl, 'Benchmark source') },
  ].filter((source) => source?.url);
}

function mergeSourceUrls(tool) {
  const candidates = [
    ...(Array.isArray(tool.sourceUrls) ? tool.sourceUrls : []),
    ...buildSourceUrls(tool),
  ];
  const seen = new Set();
  return candidates.filter((source) => {
    if (!source?.url) return false;
    const key = [source.kind || 'source', source.url].join('::').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function languageFromPath(pathname) {
  const [, first] = String(pathname || '').split('/');
  return supportedLanguages.includes(first) ? first : 'en';
}

function vendorSlugForTool(tool, productSlug) {
  const productKey = tool.id || productSlug || slugify(tool.name);
  const githubOwner = tool.githubRepo ? slugify(String(tool.githubRepo).split('/')[0]) : '';
  return tool.vendorId || vendorProductMap[productKey] || (tool.vendorName ? slugify(tool.vendorName) : '') || githubOwner;
}

export function normalizePricing(tool) {
  const pricingTier = tool.pricingTier || 'Unknown';
  const plans = Array.isArray(tool.pricingPlans) ? tool.pricingPlans : [];
  const verifiedAt = plans.find((plan) => plan?.verifiedAt)?.verifiedAt || tool.verification?.pricingVerifiedAt || tool.lastCuratedAt || null;
  const summary = pricingSummaryForAgent(tool);
  const sourceUrl = tool.pricingUrl || plans.find((plan) => plan?.sourceUrl)?.sourceUrl || null;
  return {
    display: summary.label,
    type: summary.type,
    tier: pricingTier,
    plans,
    verified: Boolean(tool.fieldVerification?.pricing || verifiedAt),
    verifiedAt,
    sourceUrl,
    sourceLabel: tool.pricingLabel || sourceLabelFromUrl(sourceUrl, 'Official pricing page'),
  };
}

function flattenText(value) {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === 'string' ? item : Object.values(item || {})).filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

function uniqueText(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function searchKeywordsForTool(tool, slug) {
  return uniqueText([
    ...(Array.isArray(tool.searchKeywords) ? tool.searchKeywords : []),
    tool.id,
    slug,
    tool.name,
    tool.category,
    tool.ecosystem,
    tool.vendorName,
    tool.companyName,
    tool.company,
    tool.githubRepo,
    ...(tool.category === 'CLI-native' ? ['cli agent', 'terminal agent', 'coding agent'] : []),
    ...(tool.category === 'IDE-attached' ? ['ide assistant', 'editor assistant', 'coding assistant'] : []),
    ...(tool.category === 'App builder' ? ['ai app builder', 'vibe coding', 'prompt to app'] : []),
    ...(tool.category === 'MCP server' ? ['mcp', 'model context protocol', 'agent infrastructure'] : []),
    ...flattenText(tool.integrations),
    ...flattenText(tool.discovery?.topics),
    ...flattenText(tool.modelSupport?.providers),
  ]);
}

function useCasesForTool(tool, slug) {
  return normalizeUseCases(tool.use_cases?.length ? tool.use_cases : tool.useCases?.length ? tool.useCases : productUseCaseTags[slug]);
}

function useCaseWeightForTool(tool, slug) {
  if (tool.useCaseWeight && typeof tool.useCaseWeight === 'object') return tool.useCaseWeight;
  const text = [tool.name, tool.description, tool.category, tool.ecosystem, tool.githubRepo, ...searchKeywordsForTool(tool, slug)].join(' ').toLowerCase();
  const weights = {};
  const rules = [
    ['Code generation', /code|coding|developer|software|repo|pull request|terminal|ide/],
    ['App building', /app builder|prompt to app|vibe|prototype|frontend|full-stack/],
    ['Data analysis', /data|analysis|analytics|notebook|research|retrieval/],
    ['Automation', /automation|workflow|agentic|orchestration|autonomous|task/],
    ['Agent infrastructure', /mcp|server|sdk|api|tool|integration|runtime/],
  ];
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) weights[label] = label === 'Code generation' ? 1 : 0.8;
  }
  return weights;
}

function vendorObjectForTool(tool) {
  return {
    name: tool.vendorName || tool.companyName || tool.company || tool.maintainerName || null,
    foundingInfo: tool.foundedAt || tool.launchDate || null,
    integrations: Array.isArray(tool.integrations) ? tool.integrations : [],
    complianceCerts: Array.isArray(tool.complianceCerts) ? tool.complianceCerts : [],
    website: tool.vendorWebsite || null,
    sourceUrl: tool.vendorSourceUrl || null,
  };
}
export function normalizeAgent(tool, sourceCheck, githubMetric) {
  const resolvedSourceCheck = sourceCheck || tool.sourceCheck || null;
  const resolvedGithubMetric = githubMetric || tool.githubMetric || null;
  const resolvedWebsite = primaryWebsiteUrl({ ...tool, sourceUrl: resolvedGithubMetric?.homepage || tool.sourceUrl });
  const slug = tool.slug || slugify(tool.id || tool.name);
  const vendorSlug = vendorSlugForTool(tool, slug);
  const ecosystem = tool.ecosystem || (tool.category === 'MCP server' ? 'MCP Servers' : tool.category === 'App builder' ? 'AI App Builders' : 'Agents');
  const sourceVerifiedAt = tool.verification?.sourceVerifiedAt || tool.lastCuratedAt || null;
  const workerCheckedAt = resolvedGithubMetric?.ok ? resolvedGithubMetric.lastVerifiedAt : resolvedSourceCheck?.lastCheckedAt || sourceVerifiedAt || null;
  const verifiedAt = resolvedGithubMetric?.ok ? resolvedGithubMetric.lastVerifiedAt : sourceVerifiedAt || resolvedSourceCheck?.lastCheckedAt || null;
  const pricing = normalizePricing(tool);
  const modelPricing = modelPricingRefsForAgent({ ...tool, website: resolvedWebsite });
  const access = tool.access || (pricing.tier === 'Open source' ? 'Open source' : 'Closed');
  const hasPublicRepo = tool.hasPublicRepo ?? Boolean(tool.githubRepo);
  const verificationStatus = resolvedSourceCheck?.status || tool.verification?.status || (sourceVerifiedAt ? "source_verified" : "unverified");
  return {
    ...tool,
    id: tool.id || slug,
    stableId: tool.id || slug,
    website: resolvedWebsite,
    slug,
    searchKeywords: searchKeywordsForTool(tool, slug),
    useCaseWeight: useCaseWeightForTool(tool, slug),
    use_cases: useCasesForTool(tool, slug),
    ecosystem,
    publicPath: vendorSlug ? '/vendors/' + vendorSlug + '/' + slug : '/ai/' + slug,
    legacyPublicPath: '/agents/' + slug,
    adminPath: '/admin/' + slug,
    displayCategory: categoryLabels[tool.category] || tool.category,
    access,
    hosting: tool.hosting || 'Cloud',
    hasPublicRepo,
    logoUrl: logoUrlForTool({ ...tool, website: resolvedWebsite }) || null,
    licenseType: tool.licenseType || null,
    vendorId: tool.vendorId || null,
    vendorName: tool.vendorName || tool.companyName || tool.company || null,
    vendorWebsite: tool.vendorWebsite || null,
    vendorSourceUrl: tool.vendorSourceUrl || null,
    vendorSourceLabel: tool.vendorSourceLabel || null,
    vendor: vendorObjectForTool(tool),
    maintainerName: tool.maintainerName || tool.companyName || tool.company || null,
    foundedAt: tool.foundedAt || tool.launchDate || null,
    modelSupport: tool.modelSupport || null,
    modelPricingRefs: modelPricing.modelPricingRefs,
    modelPricingSourceRefs: modelPricing.modelPricingSourceRefs,
    modelPricingCoverage: modelPricing.modelPricingCoverage,
    pricing,
    pricingType: pricing.type,
    pricingSummary: pricing.display,
    price: pricing.display,
    sourceUrls: mergeSourceUrls({ ...tool, website: resolvedWebsite }),
    sourceCheck: resolvedSourceCheck,
    githubMetric: resolvedGithubMetric,
    trend7d: resolvedGithubMetric?.trend7d ?? tool.trend7d ?? null,
    score: resolvedGithubMetric?.appurdexScore ?? tool.score ?? null,
    stars: resolvedGithubMetric?.stars ?? tool.stars ?? null,
    forks: resolvedGithubMetric?.forks ?? tool.forks ?? null,
    openIssues: resolvedGithubMetric?.openIssues ?? tool.openIssues ?? null,
    lastCommitAt: resolvedGithubMetric?.pushedAt ?? tool.lastCommitAt ?? null,
    contributors: resolvedGithubMetric?.contributors ?? tool.contributors ?? null,
    releaseCount: resolvedGithubMetric?.releaseCount ?? tool.releaseCount ?? null,
    dependencyCount: resolvedGithubMetric?.dependencyCount ?? tool.dependencyCount ?? null,
    verifiedAt,
    workerCheckedAt,
    last_synced_at: tool.last_synced_at || tool.lastSyncedAt || workerCheckedAt || null,
    lastSyncedAt: tool.last_synced_at || tool.lastSyncedAt || workerCheckedAt || null,
    sync_tier: tool.sync_tier || tool.syncTier || null,
    syncTier: tool.sync_tier || tool.syncTier || null,
    freshness_score: typeof tool.freshness_score === "number" ? tool.freshness_score : tool.freshnessScore ?? null,
    freshnessScore: typeof tool.freshness_score === "number" ? tool.freshness_score : tool.freshnessScore ?? null,
    relevance_score: typeof tool.relevance_score === "number" ? tool.relevance_score : tool.relevanceScore ?? null,
    relevanceScore: typeof tool.relevance_score === "number" ? tool.relevance_score : tool.relevanceScore ?? null,
    final_rank: typeof tool.final_rank === "number" ? tool.final_rank : tool.finalRank ?? null,
    finalRank: typeof tool.final_rank === "number" ? tool.final_rank : tool.finalRank ?? null,
    discovered_at: tool.discovered_at || tool.discoveredAt || tool.discovery?.discoveredAt || null,
    discoveredAt: tool.discovered_at || tool.discoveredAt || tool.discovery?.discoveredAt || null,
    sync_age_label: tool.sync_age_label || tool.syncAgeLabel || null,
    syncAgeLabel: tool.sync_age_label || tool.syncAgeLabel || null,
    sync_age_tone: tool.sync_age_tone || tool.syncAgeTone || null,
    syncAgeTone: tool.sync_age_tone || tool.syncAgeTone || null,
    verifiedAt,
    verificationStatus,
    history: tool.history || { pricingHistory: [], rankingHistory: [], repoStarHistory: [], freshnessHistory: [] },
    changeLog: Array.isArray(tool.changeLog) ? tool.changeLog : [],
    appurScore: tool.appurScore || null,
  };
}

export function freshness(value) {
  if (!value) return { label: 'Needs sync', tone: 'very-stale' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: 'Needs sync', tone: 'very-stale' };
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 1000 * 60 * 60 * 24) return { label: 'Fresh', tone: 'fresh' };
  if (ageMs < 1000 * 60 * 60 * 24 * 7) return { label: 'Stale', tone: 'stale' };
  return { label: 'Very stale', tone: 'very-stale' };
}
export function relativeTime(value) {
  if (!value) return 'Not verified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not verified';
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return 'Not synced';
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return String(minutes) + 'm ago';
  const hours = Math.round(minutes / 60);
  if (hours < 48) return String(hours) + 'h ago';
  const days = Math.round(hours / 24);
  return String(days) + 'd ago';
}

export function buildStaticState(trackedTools) {
  const agents = trackedTools.map((tool) => normalizeAgent(tool, null, null));
  return {
    agents,
    sourceChecks: {},
    suggestions: [],
    reviewQueue: [],
    vendorClaims: [],
    apiKeys: apiPlans,
    syncRuns: [],
    metricSnapshots: [],
    dataSourcePolicy: fieldDataPolicies,
    freeDataSources,
    modelPricing: modelPricingCatalog,
    modelPricingSources,
  };
}







