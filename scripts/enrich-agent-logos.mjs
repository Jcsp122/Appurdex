import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackedTools } from "../src/data/trackedTools.js";
import { readDb, writeDb } from "../server/store.mjs";

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 750000;

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
  const match = rawArg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) args.set(match[1], match[2] ?? "true");
}

const dryRun = args.has("dry-run");
const summaryOnly = args.has("summary");
const refresh = args.has("refresh");
const slugFilter = args.get("slug") || "";
const limit = numberArg("limit", Infinity);
const concurrency = Math.max(1, Math.min(20, numberArg("concurrency", DEFAULT_CONCURRENCY)));
const timeoutMs = Math.max(1000, numberArg("timeout-ms", DEFAULT_TIMEOUT_MS));
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(rootDir, "data", "appurdex-db.json");

function numberArg(name, fallback) {
  const value = Number(args.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseUrl(value) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const seedAgents = trackedTools.map((agent) => ({
  ...agent,
  slug: agent.slug || slugify(agent.id || agent.name),
}));
const seedsByKey = new Map();
for (const agent of seedAgents) {
  for (const key of [agent.slug, agent.id, agent.name, agent.githubRepo].filter(Boolean)) {
    seedsByKey.set(String(key).toLowerCase(), agent);
  }
}

function seedForAgent(agent) {
  for (const key of [agent.slug, agent.id, agent.name, agent.githubRepo].filter(Boolean)) {
    const seeded = seedsByKey.get(String(key).toLowerCase());
    if (seeded) return seeded;
  }
  return null;
}

function officialWebsiteForAgent(agent) {
  const seeded = seedForAgent(agent) || {};
  return firstNonGithubUrl(
    agent.website,
    agent.vendorWebsite,
    agent.sourceUrl,
    agent.vendorSourceUrl,
    seeded.website,
    seeded.vendorWebsite,
    seeded.sourceUrl,
    seeded.vendorSourceUrl,
  );
}

function isGithubUrl(value) {
  const parsed = parseUrl(value);
  return parsed?.hostname === "github.com" || parsed?.hostname === "www.github.com";
}

function firstNonGithubUrl(...urls) {
  return urls.find((url) => url && !isGithubUrl(url)) || "";
}

function githubOwnerFrom(agent) {
  if (agent.githubRepo) return String(agent.githubRepo).split("/")[0] || "";
  const parsed = parseUrl(agent.website || agent.sourceUrl || agent.vendorWebsite || agent.vendorSourceUrl);
  if (!parsed || !isGithubUrl(parsed.href)) return "";
  return parsed.pathname.split("/").filter(Boolean)[0] || "";
}

function githubAvatarUrl(agent) {
  const owner = githubOwnerFrom(agent);
  return owner ? `https://github.com/${owner}.png?size=128` : "";
}

function isGeneratedLogoUrl(value) {
  const text = String(value || "");
  return /google\.com\/s2\/favicons/i.test(text)
    || /icons\.duckduckgo\.com\/ip3\//i.test(text)
    || /^https:\/\/github\.com\/[^/]+\.png(?:\?|$)/i.test(text)
    || /avatars\.githubusercontent\.com\/u\//i.test(text);
}

function uniqueByUrl(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate?.url) return false;
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrsForTag(tag) {
  const attrs = {};
  const pattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function resolveUrl(value, baseUrl) {
  try {
    return value ? new URL(value, baseUrl).toString() : "";
  } catch {
    return "";
  }
}

function sizeScore(value) {
  const sizes = String(value || "").match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  return sizes.length ? Math.max(...sizes) : 0;
}

function candidate(url, source, rank, baseUrl, details = {}) {
  const resolved = resolveUrl(url, baseUrl);
  return resolved ? { url: resolved, source, rank, size: sizeScore(details.sizes), ...details } : null;
}

function iconCandidatesFromHtml(html, websiteUrl) {
  const candidates = [];
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const attrs = attrsForTag(tag);
    const rel = String(attrs.rel || "").toLowerCase();
    if (!attrs.href) continue;
    if (rel.split(/\s+/).includes("manifest")) {
      candidates.push(candidate(attrs.href, "website_manifest", 35, websiteUrl));
      continue;
    }
    if (rel.includes("apple-touch-icon")) {
      candidates.push(candidate(attrs.href, "website_apple_touch_icon", 10, websiteUrl, { sizes: attrs.sizes }));
      continue;
    }
    if (rel.includes("icon")) {
      const isSvg = /\.svg(?:[?#]|$)/i.test(attrs.href) || /svg/i.test(attrs.type || "");
      candidates.push(candidate(attrs.href, isSvg ? "website_icon_svg" : "website_icon", isSvg ? 12 : 20, websiteUrl, { sizes: attrs.sizes }));
    }
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const attrs = attrsForTag(tag);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const value = attrs.content;
    if (!value) continue;
    if (["og:image", "og:image:url", "image"].includes(key)) {
      candidates.push(candidate(value, "website_og_image", 85, websiteUrl));
    } else if (["twitter:image", "twitter:image:src"].includes(key)) {
      candidates.push(candidate(value, "website_twitter_image", 90, websiteUrl));
    }
  }
  return candidates.filter(Boolean);
}

function rootIconCandidates(websiteUrl) {
  const parsed = parseUrl(websiteUrl);
  if (!parsed) return [];
  const origin = parsed.origin;
  return [
    candidate("/favicon.svg", "website_root_icon", 40, origin),
    candidate("/apple-touch-icon.png", "website_root_icon", 42, origin),
    candidate("/favicon-32x32.png", "website_root_icon", 44, origin),
    candidate("/favicon.png", "website_root_icon", 46, origin),
    candidate("/favicon.ico", "website_root_icon", 48, origin),
  ].filter(Boolean);
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    redirect: "follow",
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "Appurdex-logo-enrichment/1.0",
      ...(options.headers || {}),
    },
  });
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`HTML fetch returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`Website returned ${contentType || "non-html content"}`);
  }
  const text = await response.text();
  return text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
}

async function manifestIconCandidates(manifestCandidate) {
  try {
    const response = await fetchWithTimeout(manifestCandidate.url, {
      headers: { Accept: "application/manifest+json,application/json" },
    });
    if (!response.ok) return [];
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/json|manifest/i.test(contentType)) return [];
    const manifest = await response.json();
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    return icons
      .map((icon) => candidate(icon.src, "website_manifest_icon", 30, manifestCandidate.url, { sizes: icon.sizes, purpose: icon.purpose }))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readUInt16BE(bytes, offset) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUInt32BE(bytes, offset) {
  return (bytes[offset] * 16777216) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function imageDimensions(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: readUInt32BE(bytes, 16), height: readUInt32BE(bytes, 20) };
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes[6] + (bytes[7] << 8), height: bytes[8] + (bytes[9] << 8) };
  }
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = readUInt16BE(bytes, offset + 2);
      if (length < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: readUInt16BE(bytes, offset + 7), height: readUInt16BE(bytes, offset + 5) };
      }
      offset += 2 + length;
    }
  }
  if (/svg\+xml/i.test(contentType)) return { width: null, height: null, vector: true };
  return null;
}

function isMetaPreviewSource(source) {
  return source === "website_og_image" || source === "website_twitter_image";
}

function validateMetaImageShape(candidateItem, dimensions) {
  if (!isMetaPreviewSource(candidateItem.source)) return null;
  if (!dimensions || !dimensions.width || !dimensions.height) return "Meta image dimensions unavailable";
  const ratio = dimensions.width / dimensions.height;
  if (ratio < 0.75 || ratio > 1.33) return `Meta image is not logo-shaped (${dimensions.width}x${dimensions.height})`;
  return null;
}

async function validateImage(candidateItem) {
  try {
    const response = await fetchWithTimeout(candidateItem.url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Range: "bytes=0-8191",
      },
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//i.test(contentType)) {
      return { ok: false, reason: contentType ? `Non-image content-type: ${contentType}` : "Missing image content-type" };
    }
    const buffer = await response.arrayBuffer();
    const dimensions = imageDimensions(buffer, contentType);
    const shapeError = validateMetaImageShape(candidateItem, dimensions);
    if (shapeError) return { ok: false, reason: shapeError };
    return { ok: true, url: response.url || candidateItem.url, contentType, dimensions };
  } catch (error) {
    return { ok: false, reason: error.message || "Fetch failed" };
  }
}
function sortCandidates(candidates) {
  return uniqueByUrl(candidates)
    .sort((left, right) => left.rank - right.rank || right.size - left.size || left.url.localeCompare(right.url));
}

function candidateSummary(candidateItem, validation) {
  return {
    url: candidateItem.url,
    source: candidateItem.source,
    reason: validation?.reason || "",
  };
}

async function resolveLogoForAgent(agent) {
  const existingLogo = agent.logoUrl || "";
  const websiteUrl = officialWebsiteForAgent(agent);
  if (existingLogo && !isGeneratedLogoUrl(existingLogo) && !refresh) {
    return {
      status: "preserved",
      slug: agent.slug,
      name: agent.name,
      logoUrl: existingLogo,
      source: "existing_reviewed_logo",
      websiteUrl,
      rejected: [],
    };
  }

  const rejected = [];
  const candidates = [];

  if (existingLogo && !isGeneratedLogoUrl(existingLogo)) {
    candidates.push({ url: existingLogo, source: "existing_reviewed_logo", rank: 0, size: 0 });
  }

  if (websiteUrl) {
    try {
      const html = await fetchText(websiteUrl);
      const htmlCandidates = iconCandidatesFromHtml(html, websiteUrl);
      candidates.push(...htmlCandidates.filter((item) => item.source !== "website_manifest"));
      const manifests = htmlCandidates.filter((item) => item.source === "website_manifest");
      for (const manifest of manifests) {
        candidates.push(...await manifestIconCandidates(manifest));
      }
      candidates.push(...rootIconCandidates(websiteUrl));
    } catch (error) {
      rejected.push({ url: websiteUrl, source: "website_html", reason: error.message || "Website fetch failed" });
      candidates.push(...rootIconCandidates(websiteUrl));
    }
  }

  const githubUrl = githubAvatarUrl(agent);
  if (githubUrl) candidates.push({ url: githubUrl, source: "github_avatar_fallback", rank: 100, size: 0 });

  for (const candidateItem of sortCandidates(candidates)) {
    const validation = await validateImage(candidateItem);
    if (validation.ok) {
      return {
        status: candidateItem.source === "github_avatar_fallback" ? "github_fallback" : "updated",
        slug: agent.slug,
        name: agent.name,
        logoUrl: validation.url,
        previousLogoUrl: existingLogo || "",
        source: candidateItem.source,
        websiteUrl: websiteUrl || "",
        rejected,
      };
    }
    rejected.push(candidateSummary(candidateItem, validation));
  }

  return {
    status: "needs_review",
    slug: agent.slug,
    name: agent.name,
    previousLogoUrl: existingLogo || "",
    websiteUrl: websiteUrl || "",
    rejected,
  };
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function matchesSlugFilter(agent) {
  if (!slugFilter) return true;
  const value = slugFilter.toLowerCase();
  return [agent.slug, agent.id, agent.name].filter(Boolean).some((item) => String(item).toLowerCase() === value);
}

async function dbFileExists() {
  try {
    await fs.access(dbPath);
    return true;
  } catch {
    return false;
  }
}

async function loadDb() {
  if (!dryRun || await dbFileExists()) return readDb();
  return {
    agents: seedAgents,
  };
}

const db = await loadDb();
const agents = (db.agents || [])
  .filter(matchesSlugFilter)
  .slice(0, Number.isFinite(limit) ? limit : undefined);

if (slugFilter && agents.length === 0) {
  console.error(JSON.stringify({ ok: false, error: `No agent matched --slug=${slugFilter}` }, null, 2));
  process.exit(1);
}

const results = await mapWithConcurrency(agents, resolveLogoForAgent);
function shouldBackfillWebsite(agent, websiteUrl) {
  return Boolean(websiteUrl) && (!agent.website || isGithubUrl(agent.website));
}

const updates = results.filter((result) => {
  const agent = (db.agents || []).find((item) => item.slug === result.slug);
  const logoChanged = ["updated", "github_fallback"].includes(result.status) && result.logoUrl && result.logoUrl !== result.previousLogoUrl;
  const websiteChanged = agent && shouldBackfillWebsite(agent, result.websiteUrl);
  return logoChanged || websiteChanged;
});

if (!dryRun && updates.length) {
  const bySlug = new Map(updates.map((result) => [result.slug, result]));
  db.agents = (db.agents || []).map((agent) => {
    const result = bySlug.get(agent.slug);
    if (!result) return agent;
    return {
      ...agent,
      logoUrl: result.logoUrl || agent.logoUrl,
      website: shouldBackfillWebsite(agent, result.websiteUrl) ? result.websiteUrl : agent.website,
      updatedAt: new Date().toISOString(),
    };
  });
  await writeDb(db);
}

const report = {
  ok: true,
  dryRun,
  refresh,
  checked: results.length,
  changed: dryRun ? 0 : updates.length,
  wouldChange: dryRun ? updates.length : 0,
  updated: results.filter((result) => result.status === "updated"),
  githubFallback: results.filter((result) => result.status === "github_fallback"),
  preserved: results.filter((result) => result.status === "preserved").map((result) => ({
    slug: result.slug,
    name: result.name,
    logoUrl: result.logoUrl,
    source: result.source,
  })),
  needsReview: results.filter((result) => result.status === "needs_review"),
  rejectedCandidates: results.flatMap((result) => (result.rejected || []).map((item) => ({
    slug: result.slug,
    name: result.name,
    ...item,
  }))),
};

const summary = {
  ok: report.ok,
  dryRun: report.dryRun,
  refresh: report.refresh,
  checked: report.checked,
  changed: report.changed,
  wouldChange: report.wouldChange,
  counts: {
    updated: report.updated.length,
    githubFallback: report.githubFallback.length,
    preserved: report.preserved.length,
    needsReview: report.needsReview.length,
    rejectedCandidates: report.rejectedCandidates.length,
  },
  samples: {
    updated: report.updated.slice(0, 10).map(({ slug, name, logoUrl, source, websiteUrl }) => ({ slug, name, logoUrl, source, websiteUrl })),
    githubFallback: report.githubFallback.slice(0, 10).map(({ slug, name, logoUrl, source, websiteUrl }) => ({ slug, name, logoUrl, source, websiteUrl })),
    needsReview: report.needsReview.slice(0, 10).map(({ slug, name, websiteUrl, rejected }) => ({ slug, name, websiteUrl, rejectedCount: rejected?.length || 0 })),
  },
};

console.log(JSON.stringify(summaryOnly ? summary : report, null, 2));
