import fsSync from "node:fs";

const DEFAULT_LIMIT = 250;
const DEFAULT_MIN_STARS = 25;

function loadLocalEnv(filePath = ".env.local") {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadLocalEnv();

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
  const match = rawArg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) args.set(match[1], match[2] ?? "true");
}

const limit = Number(args.get("limit") || process.env.APPURDEX_DISCOVERY_LIMIT || DEFAULT_LIMIT);
const minStars = Number(args.get("min-stars") || process.env.APPURDEX_DISCOVERY_MIN_STARS || DEFAULT_MIN_STARS);
const writePath = args.get("write") || process.env.APPURDEX_DISCOVERY_WRITE_PATH || null;
const token = process.env.GITHUB_TOKEN;
const maxCalls = Number(args.get("max-calls") || process.env.APPURDEX_DISCOVERY_MAX_CALLS || (token ? 60 : 8));
const requestTimeoutMs = Number(args.get("timeout-ms") || process.env.APPURDEX_DISCOVERY_TIMEOUT_MS || 15000);

const queryPhrases = [
  "AI coding",
  "coding assistant",
  "code assistant",
  "coding agent",
  "AI coding assistant",
  "AI pair programming",
  "agentic coding",
  "software engineering agent",
  "autonomous coding",
  "code agent",
  "AI code editor",
  "AI code review",
  "pull request agent",
  "terminal coding agent",
  "vibe coding",
];

const queryTopics = [
  "topic:coding-agent",
  "topic:ai-coding",
  "topic:ai-agent",
  "topic:code-assistant",
  "topic:llm-agent",
  "topic:copilot",
  "topic:mcp-server",
];

const queries = [
  ...queryPhrases.map((phrase) => `${phrase} in:name,description stars:>${minStars}`),
  ...queryTopics.map((topic) => `${topic} stars:>${minStars}`),
];

const includeSignals = [
  "ai coding",
  "coding agent",
  "ai coding assistant",
  "ai pair programming",
  "agentic coding",
  "coding assistant",
  "code assistant",
  "vibe coding",
  "software engineer",
  "codex",
  "claude code",
  "gemini cli",
  "swe-agent",
  "openhands",
  "cline",
  "aider",
  "opencode",
  "qwen code",
  "goose",
  "plandex",
  "devika",
  "gpt-engineer",
  "gpt pilot",
  "code review",
  "pull request",
  "mcp server",
];

const hardExcludePatterns = [
  /(^|[-_/])awesome([-_/]|$)/i,
  /curated\s+(list|directory)|list\s+of|collection\s+of/i,
  /\b(tutorial|handbook|course|boilerplate|template|dataset|benchmark|research paper|sample app|example repo)\b/i,
];

const excludeSignals = [
  "awesome",
  "guide",
  "handbook",
  "tutorial",
  "skills",
  "collection",
  "list of",
  "design system",
  "prompt",
  "framework",
  "library",
  "course",
  "boilerplate",
  "template",
  "dataset",
  "benchmark",
  "paper",
  "research paper",
  "sample app",
  "example",
];

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "AppurdexDiscovery/0.1",
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}

function shouldExcludeRepo(repo) {
  const text = [repo.name, repo.full_name || repo.fullName, repo.description, ...(repo.topics || [])]
    .filter(Boolean)
    .join(" ");
  return hardExcludePatterns.some((pattern) => pattern.test(text));
}

function scoreRepo(repo) {
  const text = [repo.name, repo.full_name || repo.fullName, repo.description, ...(repo.topics || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const includes = includeSignals.filter((signal) => text.includes(signal));
  const excludes = excludeSignals.filter((signal) => text.includes(signal));
  const nameBoost = /agent|codex|cline|aider|openhands|opencode|gemini|swe|roo|cursor|copilot|goose|qwen|plandex|devika/i.test(repo.name)
    ? 1
    : 0;

  return {
    score: includes.length + nameBoost - excludes.length * 2,
    includes,
    excludes,
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWebsiteUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (url.hostname === "github.com" || url.hostname === "www.github.com") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function categoryFor(repo) {
  const text = [repo.name, repo.fullName, repo.description, ...(repo.topics || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("mcp") || text.includes("model context protocol")) return "MCP server";
  if (text.includes("pull request") || text.includes("code review") || text.includes("review agent")) return "IDE-attached";
  if (text.includes("nvim") || text.includes("neovim") || text.includes("vscode") || text.includes("jetbrains") || text.includes("editor")) return "IDE-attached";
  if (text.includes("terminal") || text.includes("cli") || text.includes("command line") || text.includes("command-line")) return "CLI-native";
  if (text.includes("app builder") || text.includes("website builder") || text.includes("full-stack") || text.includes("fullstack")) return "App builder";
  if (text.includes("autonomous") || text.includes("software engineer") || text.includes("github issue")) return "Cloud agent";
  return "CLI-native";
}

function toTrackedTool(repo, generatedAt) {
  const category = categoryFor(repo);
  return {
    id: slugify(repo.fullName),
    name: repo.name,
    ecosystem: category === "App builder" ? "AI App Builders" : category === "MCP server" ? "MCP Servers" : "Agents",
    category,
    description: repo.description || "Public GitHub repository discovered by the Appurdex AI tooling search.",
    pricingTier: "Open source",
    access: "Open source",
    hosting: category === "Cloud agent" || category === "App builder" ? "Cloud" : "Local",
    website: normalizeWebsiteUrl(repo.homepage),
    githubRepo: repo.fullName,
    sourceUrl: repo.htmlUrl,
    sourceLabel: "GitHub repo",
    sourceType: "Public repository",
    statusNote: "Auto-discovered from GitHub repository search; review before adding non-GitHub claims.",
    lastCuratedAt: generatedAt.slice(0, 10),
    discovered_at: generatedAt,
    discovery: {
      source: "GitHub Search API",
      sourceQuery: repo.sourceQuery,
      starsAtDiscovery: repo.stars,
      forksAtDiscovery: repo.forks,
      language: repo.language,
      topics: repo.topics,
      discoveredAt: generatedAt,
    },
    fieldVerification: { description: Boolean(repo.description), pricing: true },
  };
}

let calls = 0;
const warnings = [];

async function searchGithub(query, page = 1) {
  if (calls >= maxCalls) {
    warnings.push(`Skipped ${query} page ${page}: request budget ${maxCalls} reached.`);
    return { items: [], limited: true };
  }

  calls += 1;
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    warnings.push(`GitHub search stopped for ${query} page ${page}: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 180)}` : ""}`);
    return { items: [], error: true, limited: response.status === 403 || response.status === 429 };
  }

  const data = await response.json();
  return {
    items: data.items.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      lastPushedAt: repo.pushed_at,
      htmlUrl: repo.html_url,
      homepage: repo.homepage,
      topics: repo.topics || [],
      sourceQuery: query,
    })),
    limited: false,
  };
}

const seen = new Map();
outer: for (const query of queries) {
  for (let page = 1; page <= 3; page += 1) {
    const { items: repos, limited, error } = await searchGithub(query, page);
    if (!repos.length) {
      if (limited || error) break outer;
      break;
    }
    for (const repo of repos) {
      if (shouldExcludeRepo(repo)) continue;
      const relevance = scoreRepo(repo);
      if (relevance.score < 1) continue;
      seen.set(repo.fullName, { ...repo, relevance });
    }
    if (seen.size >= limit * 2) break outer;
  }
}

const generatedAt = new Date().toISOString();
const candidates = [...seen.values()]
  .sort((a, b) => b.relevance.score - a.relevance.score || b.stars - a.stars)
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT);

if (!candidates.length) {
  throw new Error(`No GitHub-backed AI tooling candidates found. ${warnings.join(" ")}`.trim());
}

const result = {
  generatedAt,
  requestedLimit: limit,
  candidateCount: candidates.length,
  githubSearchCalls: calls,
  tokenConfigured: Boolean(token),
  warnings,
  note: writePath
    ? `Wrote ${candidates.length} GitHub-backed AI tooling rows to ${writePath}. Review before adding non-GitHub claims.`
    : "Review candidates before adding them to src/data/trackedTools.js. This script filters obvious noise and can write a generated module with --write=src/data/discoveredGithubTools.js.",
};

if (!writePath) {
  result.candidates = candidates;
}

if (writePath) {
  const fs = await import("node:fs/promises");
  const tools = candidates.map((repo) => toTrackedTool(repo, generatedAt));
  const moduleSource = `// Generated by scripts/discover-github-tools.mjs from the GitHub Search API.\n// Do not add pricing, benchmark, or vendor claims here unless they are separately reviewed.\n\nexport const discoveredGithubTools = ${JSON.stringify(tools, null, 2)};\n`;
  await fs.writeFile(writePath, moduleSource, "utf8");
  result.wrote = { path: writePath, tools: tools.length };
}

console.log(JSON.stringify(result, null, 2));