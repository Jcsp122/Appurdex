import crypto from "node:crypto";
import { MODEL_PRICING_SYNC_INTERVAL_MS, modelPricingSources } from "../src/data/modelPricing.js";

const PROVIDERS = new Set(["OpenAI", "Anthropic", "Google"]);
const sourceByProvider = new Map(modelPricingSources.map((source) => [source.provider, source]));

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function markdownText(value) {
  return cleanText(String(value || "").replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").replace(/[*_`]/g, ""));
}

function numberValue(value) {
  if (value === null || value === undefined || value === "-" || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyValues(value) {
  return [...String(value || "").matchAll(/\$([\d,.]+)/g)].map((match) => numberValue(match[1])).filter((item) => item !== null);
}

function plan(id, name, pricesUsdPerMillion) {
  return { id, name, unit: "usd_per_million_tokens", currency: "USD", pricesUsdPerMillion };
}

function modelEntry({ provider, modelId, model, modelFamily, status = "current", availabilityNote = null, pricingPlans, contextWindowTokens = null, contextSourceUrl = null, contextSourceLabel = null, verifiedAt }) {
  const source = sourceByProvider.get(provider);
  return {
    id: `${slugify(provider)}-${slugify(modelId)}`,
    provider,
    model,
    modelId,
    modelFamily: modelFamily || model,
    status,
    availabilityNote,
    unit: "usd_per_million_tokens",
    currency: "USD",
    tokenPricesUsdPerMillion: pricingPlans[0]?.pricesUsdPerMillion || {},
    pricingPlans,
    benchmarkScores: null,
    contextWindowTokens,
    contextSourceUrl,
    contextSourceLabel,
    contextVerifiedAt: contextWindowTokens ? verifiedAt : null,
    sourceId: source.id,
    sourceUrl: source.sourceUrl,
    sourceLabel: source.sourceLabel,
    last_synced_at: verifiedAt,
  };
}

function parseJsRows(value) {
  const rows = [];
  const rowPattern = /\[\s*"([^"]+)"\s*,\s*([^\]]+)\]/g;
  for (const match of value.matchAll(rowPattern)) {
    const values = match[2].split(",").map((item) => item.trim()).map((item) => {
      if (item === "null") return null;
      if (/^".*"$/.test(item)) return item.slice(1, -1);
      return numberValue(item);
    });
    rows.push([match[1], ...values]);
  }
  return rows;
}

export function parseOpenAiModelIds(html) {
  return new Set([...String(html || "").matchAll(/\/api\/docs\/models\/([a-z0-9][a-z0-9._-]+)/gi)].map((match) => match[1]).filter((id) => !["all", "compare"].includes(id)));
}

export function parseOpenAiModelMetadata(html) {
  const text = cleanText(html);
  const metadata = new Map();
  for (const modelId of parseOpenAiModelIds(html)) {
    const index = text.indexOf(modelId);
    if (index < 0) continue;
    const context = text.slice(index, index + 900).match(/Context window\s*([\d.]+)\s*([mk])/i);
    if (!context) continue;
    metadata.set(modelId, {
      contextWindowTokens: Math.round(Number(context[1]) * (context[2].toLowerCase() === "m" ? 1_000_000 : 1_000)),
    });
  }
  return metadata;
}

export function parseOpenAiPricingMarkdown(markdown, activeIds = new Set(), verifiedAt = new Date().toISOString(), metadata = new Map()) {
  const plansByModel = new Map();
  const panePattern = /<div data-content-switcher-pane data-value="(standard|batch|flex|priority)"[\s\S]*?<TextTokenPricingTables[\s\S]*?rows=\{\[([\s\S]*?)\]\}[\s\S]*?\/>/g;
  const names = { standard: "Standard", batch: "Batch", flex: "Flex", priority: "Priority" };
  for (const pane of String(markdown || "").matchAll(panePattern)) {
    const tier = pane[1];
    for (const [rawId, input, cachedInput, cacheWriteOrOutput, maybeOutput] of parseJsRows(pane[2])) {
      const modelId = rawId.replace(/\s*\([^\)]*context length\)\s*/i, "").trim();
      if (activeIds.size && !activeIds.has(modelId)) continue;
      const output = maybeOutput === undefined ? cacheWriteOrOutput : maybeOutput;
      const cacheWrite = maybeOutput === undefined ? null : cacheWriteOrOutput;
      const prices = { input: numberValue(input), cachedInput: numberValue(cachedInput), output: numberValue(output) };
      if (cacheWrite !== null) prices.cacheWrite = numberValue(cacheWrite);
      if (prices.input === null || prices.output === null) continue;
      if (!plansByModel.has(modelId)) plansByModel.set(modelId, []);
      plansByModel.get(modelId).push(plan(tier, names[tier], prices));
    }
  }
  return [...plansByModel.entries()].map(([modelId, pricingPlans]) => modelEntry({
    provider: "OpenAI",
    modelId,
    model: modelId,
    modelFamily: modelId.startsWith("gpt-5") ? "GPT-5" : modelId,
    status: /preview/i.test(modelId) ? "preview" : "current",
    pricingPlans,
    contextWindowTokens: metadata.get(modelId)?.contextWindowTokens || null,
    contextSourceUrl: "https://developers.openai.com/api/docs/models",
    contextSourceLabel: "OpenAI model catalog",
    verifiedAt,
  }));
}

function markdownCells(line) {
  return String(line || "").split("|").slice(1, -1).map((cell) => cell.trim());
}

export function parseAnthropicModelMetadata(markdown) {
  const metadata = new Map();
  const text = String(markdown || "");
  for (const match of text.matchAll(/(Claude\s+[A-Za-z]+(?:\s+[0-9]+(?:\.[0-9]+)?)?)\s+\(`(claude-[a-z0-9-]+)`\)/g)) {
    metadata.set(markdownText(match[1]), { modelId: match[2], contextWindowTokens: null });
  }
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const headers = markdownCells(lines[index]).map(markdownText);
    if (!headers.some((header) => /^Claude\s/i.test(header))) continue;
    let idCells = null;
    let contextCells = null;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 35); cursor += 1) {
      const cells = markdownCells(lines[cursor]);
      const label = markdownText(cells[0]);
      if (/Claude API ID/i.test(label)) idCells = cells;
      if (/Context window/i.test(label)) contextCells = cells;
    }
    headers.forEach((header, cellIndex) => {
      if (!/^Claude\s/i.test(header)) return;
      const modelId = String(idCells?.[cellIndex] || "").replace(/[`\\]/g, "").trim();
      if (!/^claude-[a-z0-9-]+$/.test(modelId)) return;
      const contextText = markdownText(contextCells?.[cellIndex] || "");
      const contextMatch = contextText.match(/([\d.]+)\s*([mk])\s*tokens/i);
      const contextWindowTokens = contextMatch ? Math.round(Number(contextMatch[1]) * (contextMatch[2].toLowerCase() === "m" ? 1_000_000 : 1_000)) : null;
      metadata.set(header, { modelId, contextWindowTokens });
    });
  }
  return metadata;
}

function normalizeAnthropicPricingName(value) {
  return markdownText(value).replace(/\s+through\s+.+$/i, "").replace(/\s+starting\s+.+$/i, "").replace(/\s*\([^\)]*(?:deprecated|retired|limited availability)[^\)]*\)\s*/i, "").trim();
}

export function parseAnthropicCatalog(pricingMarkdown, modelsMarkdown, verifiedAt = new Date().toISOString()) {
  const metadata = parseAnthropicModelMetadata(modelsMarkdown);
  const plansByName = new Map();
  const statusByName = new Map();
  const lines = String(pricingMarkdown || "").split(/\r?\n/);
  let table = null;
  for (const line of lines) {
    const cells = markdownCells(line);
    const header = cells.map(markdownText);
    if (header.includes("Base Input Tokens") && header.includes("Output Tokens")) { table = "standard"; continue; }
    if (header.includes("Batch input") && header.includes("Batch output")) { table = "batch"; continue; }
    if (!line.trim().startsWith("|") || /^\|\s*:?-+/.test(line)) { if (!line.trim()) table = null; continue; }
    if (!table || !/^Claude\s/i.test(markdownText(cells[0]))) continue;
    const rawName = cells[0];
    if (/starting\s+/i.test(markdownText(rawName))) continue;
    const name = normalizeAnthropicPricingName(rawName);
    const prices = cells.slice(1).map((cell) => moneyValues(cell)[0] ?? null);
    const nextPlan = table === "standard"
      ? plan("standard", "Standard", { input: prices[0], cacheWrite5m: prices[1], cacheWrite1h: prices[2], cacheHit: prices[3], output: prices[4] })
      : plan("batch", "Batch API", { input: prices[0], output: prices[1] });
    if (nextPlan.pricesUsdPerMillion.input === null || nextPlan.pricesUsdPerMillion.output === null) continue;
    if (!plansByName.has(name)) plansByName.set(name, []);
    plansByName.get(name).push(nextPlan);
    const rowText = markdownText(rawName);
    statusByName.set(name, /retired/i.test(rowText) ? "retired" : /deprecated/i.test(rowText) ? "deprecated" : /limited availability/i.test(rowText) ? "limited_availability" : "current");
  }
  return [...plansByName.entries()].flatMap(([name, pricingPlans]) => {
    const meta = metadata.get(name);
    if (!meta?.modelId) return [];
    return [modelEntry({
      provider: "Anthropic",
      modelId: meta.modelId,
      model: name,
      modelFamily: name.replace(/\s+[0-9].*$/, ""),
      status: statusByName.get(name) || "current",
      pricingPlans,
      contextWindowTokens: meta.contextWindowTokens,
      contextSourceUrl: "https://platform.claude.com/docs/en/about-claude/models/overview",
      contextSourceLabel: "Anthropic models overview",
      verifiedAt,
    })];
  });
}

export function parseGoogleModelIds(html) {
  return new Set([...String(html || "").matchAll(/\/gemini-api\/docs\/models\/([a-z0-9][a-z0-9._-]+)/gi)].map((match) => match[1]));
}

function googlePriceRow(section, label) {
  for (const row of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => cleanText(match[1]));
    if (cells.length >= 2 && cells[0].toLowerCase().startsWith(label.toLowerCase())) return cells[cells.length - 1];
  }
  return null;
}

export function parseGooglePricingHtml(html, activeIds = new Set(), verifiedAt = new Date().toISOString()) {
  const entries = [];
  const sections = [...String(html || "").matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\s|<\/article>|$)/gi)];
  for (const section of sections) {
    const modelId = section[1];
    if (!/^gemini-[a-z0-9._-]+$/.test(modelId) || (activeIds.size && !activeIds.has(modelId))) continue;
    const input = moneyValues(googlePriceRow(section[3], "Input price"));
    const output = moneyValues(googlePriceRow(section[3], "Output price"));
    if (!input.length || !output.length) continue;
    const cache = moneyValues(googlePriceRow(section[3], "Context caching price"));
    const prices = { input: input[0], output: output[0] };
    if (input[1] !== undefined) prices.inputOver200k = input[1];
    if (output[1] !== undefined) prices.outputOver200k = output[1];
    if (cache[0] !== undefined) prices.contextCache = cache[0];
    if (cache[1] !== undefined) prices.contextCacheOver200k = cache[1];
    const displayName = cleanText(section[2]);
    entries.push(modelEntry({
      provider: "Google",
      modelId,
      model: displayName || modelId,
      modelFamily: (displayName || modelId).replace(/\s+(?:Pro|Flash|Flash-Lite).*$/i, ""),
      status: /preview/i.test(displayName + " " + modelId) ? "preview" : "current",
      pricingPlans: [plan("standard", "Standard", prices)],
      verifiedAt,
    }));
  }
  return entries;
}

export function validateDiscoveredModel(entry) {
  if (!PROVIDERS.has(entry?.provider)) return false;
  if (!/^[a-z0-9][a-z0-9._-]+$/i.test(entry?.modelId || "")) return false;
  if (!Array.isArray(entry?.pricingPlans) || !entry.pricingPlans.length) return false;
  return entry.pricingPlans.every((item) => Number.isFinite(item?.pricesUsdPerMillion?.input) && Number.isFinite(item?.pricesUsdPerMillion?.output));
}

export function mergeDiscoveredModels(existingModels, discoveredModels) {
  const byId = new Map((existingModels || []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  let inserted = 0;
  let updated = 0;
  for (const discovered of discoveredModels || []) {
    if (!validateDiscoveredModel(discovered)) continue;
    const current = byId.get(discovered.id);
    if (current) {
      byId.set(discovered.id, {
        ...current,
        ...discovered,
        benchmarkScores: current.benchmarkScores || null,
        contextWindowTokens: discovered.contextWindowTokens || current.contextWindowTokens || null,
        contextSourceUrl: discovered.contextSourceUrl || current.contextSourceUrl || null,
        contextSourceLabel: discovered.contextSourceLabel || current.contextSourceLabel || null,
        contextVerifiedAt: discovered.contextVerifiedAt || current.contextVerifiedAt || null,
      });
      updated += 1;
    } else {
      byId.set(discovered.id, discovered);
      inserted += 1;
    }
  }
  return { models: [...byId.values()], inserted, updated };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function due(check) {
  if (check?.catalogSyncVersion !== 1) return true;
  const timestamp = check?.next_sync_at ? new Date(check.next_sync_at).getTime() : 0;
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

const adapters = [
  {
    provider: "OpenAI",
    urls: ["https://developers.openai.com/api/docs/pricing.md", "https://developers.openai.com/api/docs/models/all", "https://developers.openai.com/api/docs/models"],
    parse: ([pricing, models, featuredModels], verifiedAt) => parseOpenAiPricingMarkdown(pricing, parseOpenAiModelIds(models), verifiedAt, parseOpenAiModelMetadata(featuredModels)),
  },
  {
    provider: "Anthropic",
    urls: ["https://platform.claude.com/docs/en/about-claude/pricing.md", "https://platform.claude.com/docs/en/about-claude/models/overview.md"],
    parse: ([pricing, models], verifiedAt) => parseAnthropicCatalog(pricing, models, verifiedAt),
  },
  {
    provider: "Google",
    urls: ["https://ai.google.dev/gemini-api/docs/pricing?hl=en", "https://ai.google.dev/gemini-api/docs/models?hl=en"],
    parse: ([pricing, models], verifiedAt) => parseGooglePricingHtml(pricing, parseGoogleModelIds(models), verifiedAt),
  },
];

export async function syncOfficialModelCatalog(db, { fetchImpl = fetch, verifiedAt = new Date().toISOString() } = {}) {
  db.modelPricingSourceChecks = db.modelPricingSourceChecks || {};
  db.modelPricing = db.modelPricing || [];
  const results = [];
  for (const adapter of adapters) {
    const source = sourceByProvider.get(adapter.provider);
    const previous = db.modelPricingSourceChecks[source.id] || null;
    if (!due(previous)) continue;
    try {
      const responses = await Promise.all(adapter.urls.map((url) => fetchImpl(url, { headers: { "User-Agent": "AppurdexResearchWorker/0.2" } })));
      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(`${adapter.provider} official source returned HTTP ${failed.status}`);
      const bodies = await Promise.all(responses.map((response) => response.text()));
      const discovered = adapter.parse(bodies, verifiedAt).filter(validateDiscoveredModel);
      if (!discovered.length) throw new Error(`${adapter.provider} official source produced no validated model pricing rows.`);
      const merged = mergeDiscoveredModels(db.modelPricing, discovered);
      db.modelPricing = merged.models;
      const contentHash = hash(bodies.join("\n---SOURCE---\n"));
      const check = {
        sourceId: source.id,
        provider: adapter.provider,
        catalogSyncVersion: 1,
        status: "ok",
        httpStatus: 200,
        sourceUrl: source.sourceUrl,
        content_hash: contentHash,
        last_synced_at: verifiedAt,
        next_sync_at: new Date(new Date(verifiedAt).getTime() + MODEL_PRICING_SYNC_INTERVAL_MS).toISOString(),
        changed: Boolean(previous?.content_hash && previous.content_hash !== contentHash),
        autoPublished: discovered.length,
        inserted: merged.inserted,
        updated: merged.updated,
        error: null,
      };
      db.modelPricingSourceChecks[source.id] = check;
      results.push(check);
    } catch (error) {
      const check = {
        sourceId: source.id,
        provider: adapter.provider,
        catalogSyncVersion: 1,
        status: "error",
        sourceUrl: source.sourceUrl,
        last_synced_at: verifiedAt,
        next_sync_at: new Date(new Date(verifiedAt).getTime() + MODEL_PRICING_SYNC_INTERVAL_MS).toISOString(),
        changed: false,
        autoPublished: 0,
        error: error.message,
      };
      db.modelPricingSourceChecks[source.id] = check;
      results.push(check);
    }
  }
  return results;
}
