export const MODEL_PRICING_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const modelPricingSources = [
  {
    id: "anthropic-claude-api-pricing",
    provider: "Anthropic",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    sourceLabel: "Anthropic Claude API pricing",
    cadence: "24h",
    trackedFields: ["input_tokens", "output_tokens", "prompt_cache_writes", "prompt_cache_hits", "batch", "fast_mode"],
  },
  {
    id: "openai-api-pricing",
    provider: "OpenAI",
    sourceUrl: "https://platform.openai.com/docs/pricing",
    sourceLabel: "OpenAI API pricing",
    cadence: "24h",
    trackedFields: ["input_tokens", "cached_input_tokens", "output_tokens", "standard", "batch", "flex", "priority"],
  },
  {
    id: "google-gemini-api-pricing",
    provider: "Google",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    sourceLabel: "Google Gemini API pricing",
    cadence: "24h",
    trackedFields: ["input_tokens", "output_tokens", "context_cache_tokens", "cache_storage", "standard", "batch", "flex", "priority"],
  },
  {
    id: "github-copilot-plans",
    provider: "GitHub Copilot",
    sourceUrl: "https://docs.github.com/en/copilot/about-github-copilot/subscription-plans-for-github-copilot",
    sourceLabel: "GitHub Copilot plans",
    cadence: "24h",
    trackedFields: ["subscription_pricing", "premium_requests"],
  },
];

const sourceByProvider = {
  Anthropic: modelPricingSources[0],
  OpenAI: modelPricingSources[1],
  Google: modelPricingSources[2],
  "GitHub Copilot": modelPricingSources[3],
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function usagePlan(id, name, pricesUsdPerMillion, extra = {}) {
  return {
    id,
    name,
    unit: extra.unit || "usd_per_million_tokens",
    currency: "USD",
    pricesUsdPerMillion,
    ...extra,
  };
}

function modelEntry({ provider, model, modelId, modelFamily, status = "current", availabilityNote = null, effectiveFrom = null, effectiveUntil = null, pricingPlans = [] }) {
  const source = sourceByProvider[provider];
  const firstPlan = pricingPlans[0] || null;
  return {
    id: `${slugify(provider)}-${slugify(modelId || model)}`,
    provider,
    model,
    modelId: modelId || null,
    modelFamily: modelFamily || model,
    status,
    availabilityNote,
    unit: "usd_per_million_tokens",
    currency: "USD",
    tokenPricesUsdPerMillion: firstPlan?.pricesUsdPerMillion || {},
    pricingPlans,
    effectiveFrom,
    effectiveUntil,
    sourceId: source.id,
    sourceUrl: source.sourceUrl,
    sourceLabel: source.sourceLabel,
    last_synced_at: null,
  };
}

function claudePlans(input, output, extra = {}) {
  const standard = usagePlan("standard", "Standard", {
    input,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheHit: input * 0.1,
    output,
  });
  const batch = usagePlan("batch", "Batch API", {
    input: input * 0.5,
    output: output * 0.5,
  }, { note: "Batch API pricing is a 50% discount on input and output tokens." });
  return extra.fastMode ? [standard, usagePlan("fast-mode", "Fast mode", extra.fastMode, { note: extra.fastModeNote || "Fast mode premium pricing." }), batch] : [standard, batch];
}

function openAiPlan(id, name, shortContext, longContext = null, extra = {}) {
  return usagePlan(id, name, {
    input: shortContext.input,
    cachedInput: shortContext.cachedInput ?? null,
    output: shortContext.output,
    ...(longContext ? {
      inputLongContext: longContext.input,
      cachedInputLongContext: longContext.cachedInput ?? null,
      outputLongContext: longContext.output,
    } : {}),
  }, extra);
}

function geminiTextPlan(id, name, values, extra = {}) {
  return usagePlan(id, name, values, extra);
}

export const modelPricingCatalog = [
  modelEntry({ provider: "Anthropic", model: "Claude Fable 5", modelFamily: "Claude Fable", pricingPlans: claudePlans(10, 50) }),
  modelEntry({ provider: "Anthropic", model: "Claude Mythos 5", modelFamily: "Claude Mythos", status: "limited_availability", availabilityNote: "Limited availability.", pricingPlans: claudePlans(10, 50) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4.8", modelFamily: "Claude Opus", pricingPlans: claudePlans(5, 25, { fastMode: { input: 10, output: 50 } }) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4.7", modelFamily: "Claude Opus", pricingPlans: claudePlans(5, 25, { fastMode: { input: 30, output: 150 }, fastModeNote: "Fast mode for Claude Opus 4.7 is deprecated and scheduled for removal on 2026-07-24." }) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4.6", modelFamily: "Claude Opus", pricingPlans: claudePlans(5, 25) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4.5", modelFamily: "Claude Opus", pricingPlans: claudePlans(5, 25) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4.1", modelFamily: "Claude Opus", status: "deprecated", pricingPlans: claudePlans(15, 75) }),
  modelEntry({ provider: "Anthropic", model: "Claude Opus 4", modelFamily: "Claude Opus", status: "retired_except_cloud", availabilityNote: "Retired except on Google Cloud.", pricingPlans: claudePlans(15, 75) }),
  modelEntry({ provider: "Anthropic", model: "Claude Sonnet 5", modelFamily: "Claude Sonnet", availabilityNote: "Introductory pricing through 2026-08-31.", effectiveUntil: "2026-08-31", pricingPlans: claudePlans(2, 10) }),
  modelEntry({ provider: "Anthropic", model: "Claude Sonnet 5", modelId: "claude-sonnet-5-standard-2026-09-01", modelFamily: "Claude Sonnet", status: "scheduled", availabilityNote: "Standard pricing starting 2026-09-01.", effectiveFrom: "2026-09-01", pricingPlans: claudePlans(3, 15) }),
  modelEntry({ provider: "Anthropic", model: "Claude Sonnet 4.6", modelFamily: "Claude Sonnet", pricingPlans: claudePlans(3, 15) }),
  modelEntry({ provider: "Anthropic", model: "Claude Sonnet 4.5", modelFamily: "Claude Sonnet", pricingPlans: claudePlans(3, 15) }),
  modelEntry({ provider: "Anthropic", model: "Claude Sonnet 4", modelFamily: "Claude Sonnet", status: "retired_except_cloud", availabilityNote: "Retired except on Bedrock and Google Cloud.", pricingPlans: claudePlans(3, 15) }),
  modelEntry({ provider: "Anthropic", model: "Claude Haiku 4.5", modelFamily: "Claude Haiku", pricingPlans: claudePlans(1, 5) }),
  modelEntry({ provider: "Anthropic", model: "Claude Haiku 3.5", modelFamily: "Claude Haiku", status: "retired_except_cloud", availabilityNote: "Retired except on Bedrock and Google Cloud.", pricingPlans: claudePlans(0.8, 4) }),

  modelEntry({ provider: "OpenAI", model: "gpt-5.5", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 5, cachedInput: 0.5, output: 30 }, { input: 10, cachedInput: 1, output: 45 }), openAiPlan("batch", "Batch", { input: 2.5, cachedInput: 0.25, output: 15 }, { input: 5, cachedInput: 0.5, output: 22.5 }), openAiPlan("flex", "Flex", { input: 2.5, cachedInput: 0.25, output: 15 }, { input: 5, cachedInput: 0.5, output: 22.5 }), openAiPlan("priority", "Priority", { input: 12.5, cachedInput: 1.25, output: 75 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.5-pro", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 30, output: 180 }, { input: 60, output: 270 }), openAiPlan("batch", "Batch", { input: 15, output: 90 }), openAiPlan("flex", "Flex", { input: 15, output: 90 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.4", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 2.5, cachedInput: 0.25, output: 15 }, { input: 5, cachedInput: 0.5, output: 22.5 }), openAiPlan("batch", "Batch", { input: 1.25, cachedInput: 0.13, output: 7.5 }, { input: 2.5, cachedInput: 0.25, output: 11.25 }), openAiPlan("flex", "Flex", { input: 1.25, cachedInput: 0.13, output: 7.5 }, { input: 2.5, cachedInput: 0.25, output: 11.25 }), openAiPlan("priority", "Priority", { input: 5, cachedInput: 0.5, output: 30 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.4-mini", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 0.75, cachedInput: 0.075, output: 4.5 }), openAiPlan("batch", "Batch", { input: 0.375, cachedInput: 0.0375, output: 2.25 }), openAiPlan("flex", "Flex", { input: 0.375, cachedInput: 0.0375, output: 2.25 }), openAiPlan("priority", "Priority", { input: 1.5, cachedInput: 0.15, output: 9 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.4-nano", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 0.2, cachedInput: 0.02, output: 1.25 }), openAiPlan("batch", "Batch", { input: 0.1, cachedInput: 0.01, output: 0.625 }), openAiPlan("flex", "Flex", { input: 0.1, cachedInput: 0.01, output: 0.625 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.4-pro", modelFamily: "GPT-5", pricingPlans: [openAiPlan("standard", "Standard", { input: 30, output: 180 }, { input: 60, output: 270 }), openAiPlan("batch", "Batch", { input: 15, output: 90 }, { input: 30, output: 135 }), openAiPlan("flex", "Flex", { input: 15, output: 90 }, { input: 30, output: 135 })] }),
  modelEntry({ provider: "OpenAI", model: "chat-latest", modelFamily: "ChatGPT", pricingPlans: [openAiPlan("standard", "Standard", { input: 5, cachedInput: 0.5, output: 30 })] }),
  modelEntry({ provider: "OpenAI", model: "gpt-5.3-codex", modelFamily: "GPT-5 Codex", pricingPlans: [openAiPlan("standard", "Standard", { input: 1.75, cachedInput: 0.175, output: 14 }), openAiPlan("priority", "Priority", { input: 3.5, cachedInput: 0.35, output: 28 })] }),
  modelEntry({ provider: "OpenAI", model: "o3-deep-research", modelFamily: "Deep Research", pricingPlans: [openAiPlan("batch", "Batch", { input: 5, output: 20 })] }),
  modelEntry({ provider: "OpenAI", model: "o4-mini-deep-research", modelFamily: "Deep Research", pricingPlans: [openAiPlan("batch", "Batch", { input: 1, output: 4 })] }),
  modelEntry({ provider: "OpenAI", model: "computer-use-preview", modelFamily: "Computer Use", pricingPlans: [openAiPlan("batch", "Batch", { input: 1.5, output: 6 })] }),

  modelEntry({ provider: "Google", model: "Gemini 3.1 Pro Preview", modelId: "gemini-3.1-pro-preview", modelFamily: "Gemini 3.1", status: "preview", pricingPlans: [geminiTextPlan("standard", "Standard", { input: 2, inputOver200k: 4, output: 12, outputOver200k: 18, contextCache: 0.2, contextCacheOver200k: 0.4, cacheStoragePerHour: 4.5 }), geminiTextPlan("batch", "Batch", { input: 1, inputOver200k: 2, output: 6, outputOver200k: 9, contextCache: 0.2, contextCacheOver200k: 0.4, cacheStoragePerHour: 4.5 }), geminiTextPlan("flex", "Flex", { input: 1, inputOver200k: 2, output: 6, outputOver200k: 9, contextCache: 0.2, contextCacheOver200k: 0.4, cacheStoragePerHour: 4.5 }), geminiTextPlan("priority", "Priority", { input: 3.6, inputOver200k: 7.2, output: 21.6, outputOver200k: 32.4, contextCache: 0.36, contextCacheOver200k: 0.72, cacheStoragePerHour: 8.1 })] }),
  modelEntry({ provider: "Google", model: "Gemini 3 Flash Preview", modelId: "gemini-3-flash-preview", modelFamily: "Gemini 3", status: "preview", pricingPlans: [geminiTextPlan("standard", "Standard", { inputTextImageVideo: 0.5, inputAudio: 1, output: 3, contextCacheTextImageVideo: 0.05, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("batch", "Batch", { inputTextImageVideo: 0.25, inputAudio: 0.5, output: 1.5, contextCacheTextImageVideo: 0.05, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("flex", "Flex", { inputTextImageVideo: 0.25, inputAudio: 0.5, output: 1.5, contextCacheTextImageVideo: 0.05, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("priority", "Priority", { inputTextImageVideo: 0.9, inputAudio: 1.8, output: 5.4, contextCacheTextImageVideo: 0.09, contextCacheAudio: 0.18, cacheStoragePerHour: 1.8 })] }),
  modelEntry({ provider: "Google", model: "Gemini 3.1 Flash-Lite", modelId: "gemini-3.1-flash-lite", modelFamily: "Gemini 3.1", pricingPlans: [geminiTextPlan("standard", "Standard", { inputTextImageVideo: 0.25, inputAudio: 0.5, output: 1.5, contextCacheTextImageVideo: 0.025, contextCacheAudio: 0.05, cacheStoragePerHour: 1 }), geminiTextPlan("batch", "Batch", { inputTextImageVideo: 0.125, inputAudio: 0.25, output: 0.75, contextCacheTextImageVideo: 0.0125, contextCacheAudio: 0.025, cacheStoragePerHour: 0.5 }), geminiTextPlan("flex", "Flex", { inputTextImageVideo: 0.125, inputAudio: 0.25, output: 0.75, contextCacheTextImageVideo: 0.0125, contextCacheAudio: 0.025, cacheStoragePerHour: 0.5 }), geminiTextPlan("priority", "Priority", { inputTextImageVideo: 0.45, inputAudio: 0.9, output: 2.7, contextCacheTextImageVideo: 0.045, contextCacheAudio: 0.09, cacheStoragePerHour: 1.8 })] }),
  modelEntry({ provider: "Google", model: "Gemini 2.5 Pro", modelId: "gemini-2.5-pro", modelFamily: "Gemini 2.5", pricingPlans: [geminiTextPlan("standard", "Standard", { input: 1.25, inputOver200k: 2.5, output: 10, outputOver200k: 15, contextCache: 0.125, contextCacheOver200k: 0.25, cacheStoragePerHour: 4.5 }), geminiTextPlan("batch", "Batch", { input: 0.625, inputOver200k: 1.25, output: 5, outputOver200k: 7.5, contextCache: 0.125, contextCacheOver200k: 0.25, cacheStoragePerHour: 4.5 }), geminiTextPlan("flex", "Flex", { input: 0.625, inputOver200k: 1.25, output: 5, outputOver200k: 7.5, contextCache: 0.125, contextCacheOver200k: 0.25, cacheStoragePerHour: 4.5 }), geminiTextPlan("priority", "Priority", { input: 2.25, inputOver200k: 4.5, output: 18, outputOver200k: 27, contextCache: 0.225, contextCacheOver200k: 0.45, cacheStoragePerHour: 8.1 })] }),
  modelEntry({ provider: "Google", model: "Gemini 2.5 Flash", modelId: "gemini-2.5-flash", modelFamily: "Gemini 2.5", pricingPlans: [geminiTextPlan("standard", "Standard", { inputTextImageVideo: 0.3, inputAudio: 1, output: 2.5, contextCacheTextImageVideo: 0.03, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("batch", "Batch", { inputTextImageVideo: 0.15, inputAudio: 0.5, output: 1.25, contextCacheTextImageVideo: 0.03, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("flex", "Flex", { inputTextImageVideo: 0.15, inputAudio: 0.5, output: 1.25, contextCacheTextImageVideo: 0.03, contextCacheAudio: 0.1, cacheStoragePerHour: 1 }), geminiTextPlan("priority", "Priority", { inputTextImageVideo: 0.54, inputAudio: 1.8, output: 4.5, contextCacheTextImageVideo: 0.054, contextCacheAudio: 0.18, cacheStoragePerHour: 1.8 })] }),
  modelEntry({ provider: "Google", model: "Gemini 2.5 Flash-Lite", modelId: "gemini-2.5-flash-lite", modelFamily: "Gemini 2.5", pricingPlans: [geminiTextPlan("standard", "Standard", { inputTextImageVideo: 0.1, inputAudio: 0.3, output: 0.4, contextCacheTextImageVideo: 0.01, contextCacheAudio: 0.03, cacheStoragePerHour: 1 }), geminiTextPlan("batch", "Batch", { inputTextImageVideo: 0.05, inputAudio: 0.15, output: 0.2, contextCacheTextImageVideo: 0.01, contextCacheAudio: 0.03, cacheStoragePerHour: 1 }), geminiTextPlan("flex", "Flex", { inputTextImageVideo: 0.05, inputAudio: 0.15, output: 0.2, contextCacheTextImageVideo: 0.01, contextCacheAudio: 0.03, cacheStoragePerHour: 1 }), geminiTextPlan("priority", "Priority", { inputTextImageVideo: 0.18, inputAudio: 0.54, output: 0.72, contextCacheTextImageVideo: 0.018, contextCacheAudio: 0.054, cacheStoragePerHour: 1.8 })] }),
];

const providerSourceMap = new Map(modelPricingSources.map((source) => [source.provider.toLowerCase(), source.id]));
const providerAliases = {
  anthropic: "Anthropic",
  claude: "Anthropic",
  openai: "OpenAI",
  "open ai": "OpenAI",
  google: "Google",
  gemini: "Google",
  "github copilot": "GitHub Copilot",
  copilot: "GitHub Copilot",
};

export function normalizeModelProvider(value) {
  const key = String(value || "").trim().toLowerCase();
  return providerAliases[key] || (value ? String(value).trim() : null);
}

function providerFromOfficialUrl(url) {
  try {
    const parsed = url ? new URL(url) : null;
    const hostname = parsed?.hostname.replace(/^www\./, "") || "";
    if (["anthropic.com", "claude.com", "code.claude.com", "platform.claude.com"].some((domain) => hostname === domain || hostname.endsWith("." + domain))) return "Anthropic";
    if (["openai.com", "chatgpt.com", "platform.openai.com", "developers.openai.com"].some((domain) => hostname === domain || hostname.endsWith("." + domain))) return "OpenAI";
    if (["ai.google.dev", "gemini.google.com", "geminicli.com"].some((domain) => hostname === domain || hostname.endsWith("." + domain))) return "Google";
    return null;
  } catch {
    return null;
  }
}

function providerCandidatesForAgent(agent, modelSupport) {
  const providers = Array.isArray(modelSupport.providers)
    ? modelSupport.providers
    : String(modelSupport.providers || "").split(",").map((item) => item.trim()).filter(Boolean);
  const sourceProvider = providerFromOfficialUrl(agent?.website) || providerFromOfficialUrl(agent?.sourceUrl) || providerFromOfficialUrl(agent?.vendorWebsite) || providerFromOfficialUrl(agent?.vendorSourceUrl);
  const githubProvider = String(agent?.githubRepo || "").toLowerCase().startsWith("google-gemini/") ? "Google" : null;
  const officialCopilotSource = /github\.com\/features\/copilot|github\.com\/github\/copilot|docs\.github\.com\/.*copilot/i.test(String(agent?.website || "") + " " + String(agent?.sourceUrl || ""));
  const githubVendor = /^github$/i.test(String(agent?.vendorName || agent?.companyName || agent?.maintainerName || "").trim());
  const githubCopilotId = /^github-copilot/i.test(String(agent?.id || agent?.slug || ""));
  const copilotProvider = /copilot/i.test(String(agent?.name || "")) && (officialCopilotSource || githubVendor || githubCopilotId) ? "GitHub Copilot" : null;
  return [...providers, sourceProvider, githubProvider, copilotProvider].filter(Boolean);
}

export function modelPricingRefsForAgent(agent) {
  const modelSupport = agent?.modelSupport || {};
  const explicitModelRefs = Array.isArray(agent?.modelPricingRefs) ? agent.modelPricingRefs.filter(Boolean) : [];
  const explicitSourceRefs = [];
  const providers = providerCandidatesForAgent(agent, modelSupport);
  const providerSourceRefs = providers
    .map(normalizeModelProvider)
    .filter(Boolean)
    .map((provider) => providerSourceMap.get(provider.toLowerCase()))
    .filter(Boolean);
  const modelPricingRefs = [...new Set(explicitModelRefs)];
  const modelPricingSourceRefs = [...new Set([...explicitSourceRefs, ...providerSourceRefs])];
  const modelPricingCoverage = modelPricingRefs.length
    ? "exact_model_pricing"
    : modelPricingSourceRefs.length
      ? "provider_pricing_source"
      : "unknown";

  return { modelPricingRefs, modelPricingSourceRefs, modelPricingCoverage };
}