import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  Bell,
  Bot,
  BookOpen,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Code2,
  ExternalLink,
  FileText,
  Filter,
  Home,
  KeyRound,
  Link2,
  Languages,
  LogOut,
  Mail,
  MessageSquarePlus,
  Moon,
  Plug,
  Plus,
  RefreshCw,
  RadioTower,
  Settings,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";
import appurdexLogoUrl from "../logo/a-logo.png";
import { trackedTools } from "./data/trackedTools";
import { vendorCatalog, vendorProductMap } from "./data/vendorCatalog";
import {
  normalizeUseCases,
  populatedUseCases,
  productsForUseCase,
  useCaseLabel,
  useCasesForGroup,
  useCaseSearchText as taxonomyUseCaseSearchText,
} from "./data/useCaseTaxonomy";
import {
  agentMatchesMonthlyBudget,
  apiPlans,
  buildStaticState,
  freshness,
  languageFromPath,
  normalizeAgent,
  relativeTime,
  slugify,
  standardizePricingAmount,
} from "./lib/agentModel";
import {
  createApiKey,
  createCheckoutSession,
  createCustomerApiKey,
  createPortalSession,
  createAccountWatchlist,
  createSavedComparison,
  deleteAccountWatchlist,
  deleteSavedComparison,
  authNavigationUrl,
  getAdminState,
  getAssistantConfig,
  getPublicAgents,
  getViewer,
  getAccountWatchlists,
  getSavedComparisons,
  logoutViewer,
  researchSearch,
  runWorkerNow,
  sendAssistantMessage,
  startEmailSignIn,
  updateAgent,
  updateReviewItem,
} from "./lib/appurdexApi";
import { initAnalytics, trackEvent, trackPageView, trackSearch } from "./lib/analytics";

const configuredAiProvider = import.meta.env.VITE_AI_PROVIDER || "OpenAI";
const configuredAiModel = import.meta.env.VITE_OPENAI_MODEL || import.meta.env.VITE_AI_MODEL || "";
const configuredAiModelLabel = configuredAiModel ? `${configuredAiProvider} ${configuredAiModel}` : "Not configured";
const APPURDEX_AI_EXPERIENCE_OPTIONS = ["Newcomer", "Regular", "Power user", "Founder", "Researcher"];
const APPURDEX_AI_WRITING_STYLE_OPTIONS = ["Default", "Journalist", "Storytelling", "For vibe coders", "Concise"];

const navItems = [
  { label: "Overview", icon: Home, path: "/" },
  { label: "Agents", icon: Code2, path: "/agents" },
  { label: "Learn", icon: BookOpen, path: "/learn" },  { label: "Compare", icon: SlidersHorizontal, path: "/compare" },
  { label: "Use Cases", icon: Tags, path: "/use-cases" },
  { label: "Appurdex AI", icon: Bot, path: "/assistant" },
  { label: "Alerts", icon: Bell, path: "/alerts" },
  { label: "Watchlist", icon: Bookmark, path: "/saved" },
  { label: "API", icon: KeyRound, path: "/api" },
  { label: "Settings", icon: FileText, path: "/settings" },
];

const lowerNav = [
  { label: "Docs", icon: FileText, path: "/docs/data-sourcing.md" },
];

const DEFAULT_DIRECTORY_PAGE_SIZE = 25;
const DIRECTORY_PAGE_SIZE_OPTIONS = [25, 50, 100];
const DIRECTORY_SORT_OPTIONS = ["Newest", "Oldest", "Score", "Last updated", "Freshness", "Trend 7d", "Name", "Category", "Pricing", "Access", "Hosting", "Repo / Docs", "Popularity", "Stars"];
const DIRECTORY_SORT_COLUMNS = [
  { label: "Product", sort: "Name" },
  { label: "Category", sort: "Category" },
  { label: "Pricing", sort: "Pricing" },
  { label: "Access", sort: "Access" },
  { label: "Hosting", sort: "Hosting" },
  { label: "Repo / Docs", sort: "Repo / Docs" },
  { label: "Last updated", sort: "Last updated" },
  { label: "Freshness", sort: "Freshness" },
  { label: "Trend 7d", sort: "Trend 7d" },
];

const categoryClass = {
  "IDE-attached": "blue",
  "CLI-native": "purple",
  "Cloud agent": "purple",
  "App builder": "orange",
  "MCP server": "green",
};

const APPURDEX_USE_CASE_GROUP = "coding_specific";
const APPURDEX_USE_CASES = useCasesForGroup(APPURDEX_USE_CASE_GROUP);
const USE_CASE_OPTIONS = APPURDEX_USE_CASES.map((useCase) => useCase.label);

const DEFAULT_FILTERS = { query: "", ecosystem: "All", category: "All", priceBudget: { min: "", max: "" }, access: "All", useCase: "All", modelFlex: "All", publicRepo: "All", sortBy: "Newest" };
const WATCHLIST_ALERT_OPTIONS = [
  { id: "pricing", label: "Pricing", icon: CircleDollarSign },
  { id: "access", label: "Access/Availability", icon: KeyRound },
  { id: "new_tool", label: "New tool", icon: Plus },
  { id: "freshness", label: "Freshness", icon: Activity },
];

const ALERT_TYPE_UI = Object.fromEntries(WATCHLIST_ALERT_OPTIONS.map((item) => [item.id, item]));

function alertTypeLabel(changeType) {
  return ALERT_TYPE_UI[changeType]?.label || "Change";
}

function alertTypeIcon(changeType) {
  return ALERT_TYPE_UI[changeType]?.icon || Bell;
}
const appRoutePrefixes = new Set(["admin", "en", "ai", "agents", "vendors", "research", "compare", "use-cases", "assistant", "request-form", "requests-form", "analytics", "learn", "alerts", "saved", "api", "settings"]);

const agentLogoDomains = {
  cursor: "cursor.com",
  cline: "cline.bot",
  aider: "aider.chat",
  continue: "continue.dev",
  devin: "devin.ai",
  lovable: "lovable.dev",
  "sourcegraph-cody": "sourcegraph.com",
  "replit-agent": "replit.com",
  "bolt-new": "bolt.new",
  "augment-code": "augmentcode.com",
  tabby: "tabby.tabbyml.com",
  v0: "v0.dev",
  paneflow: "paneflow.dev",
};

const reviewedLogoOverrides = {
  aider: "https://github.com/Aider-AI.png?size=64",
  continue: "https://github.com/continuedev.png?size=64",
  paneflow: "https://www.google.com/s2/favicons?domain=paneflow.dev&sz=64",
};

const preferredOrder = [
  "cursor",
  "cline",
  "devin",
  "sourcegraph-cody",
  "replit-agent",
  "bolt-new",
  "augment-code",
  "tabby",
  "continue",
];

function faviconForDomain(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function parseUrl(url) {
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}

function isGithubUrl(url) {
  const parsed = parseUrl(url);
  return parsed?.hostname === "github.com" || parsed?.hostname === "www.github.com";
}

function isGeneratedLogoUrl(url) {
  return /google\.com\/s2\/favicons/i.test(String(url || "")) || /github\.com\/[^/]+\.png/i.test(String(url || ""));
}

function firstNonGithubUrl(...urls) {
  return urls.find((url) => url && !isGithubUrl(url)) || "";
}

function githubOwnerFrom(agent) {
  if (agent.githubRepo) return agent.githubRepo.split("/")[0] || null;
  const parsed = parseUrl(agent.website || agent.sourceUrl);
  if (!parsed || parsed.hostname !== "github.com") return null;
  return parsed.pathname.split("/").filter(Boolean)[0] || null;
}

function githubAvatarUrl(owner) {
  return owner ? `https://github.com/${owner}.png?size=64` : "";
}

function vendorForLogo(agent) {
  const key = agent?.slug || agent?.id;
  const vendorId = agent?.vendorId || vendorProductMap[key];
  return vendorId ? vendorCatalog.find((vendor) => vendor.id === vendorId) || null : null;
}

function uniqueLogoSources(...sources) {
  return [...new Set(sources.filter(Boolean))];
}

function officialIconSourcesFromUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed || isGithubUrl(parsed.href)) return [];
  const host = parsed.hostname;
  return uniqueLogoSources(
    faviconForDomain(host),
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  );
}

function logoSourcesForAgent(agent) {
  const key = agent?.slug || agent?.id;
  const curatedLogo = agent?.logoUrl && !isGeneratedLogoUrl(agent.logoUrl) ? agent.logoUrl : "";
  const officialUrl = firstNonGithubUrl(agent?.website, agent?.vendorWebsite, agent?.sourceUrl, agent?.vendorSourceUrl);
  const vendor = vendorForLogo(agent);
  const vendorLogo = vendor?.logoUrl || "";
  const vendorUrl = firstNonGithubUrl(vendor?.website, vendor?.sourceUrl);
  const githubAvatar = githubAvatarUrl(githubOwnerFrom(agent));
  return uniqueLogoSources(
    curatedLogo,
    reviewedLogoOverrides[key],
    agentLogoDomains[key] ? faviconForDomain(agentLogoDomains[key]) : "",
    ...officialIconSourcesFromUrl(officialUrl),
    vendorLogo,
    ...officialIconSourcesFromUrl(vendorUrl),
    agent?.logoUrl,
    githubAvatar,
  );
}

function logoFor(agent) {
  return logoSourcesForAgent(agent)[0] || "";
}

function githubOwnerFromVendor(vendor) {
  const parsed = parseUrl(vendor.sourceUrl || vendor.website);
  if (!parsed || parsed.hostname !== "github.com") return null;
  return parsed.pathname.split("/").filter(Boolean)[0] || null;
}

function logoSourcesForVendor(vendor) {
  const officialUrl = firstNonGithubUrl(vendor?.website, vendor?.sourceUrl);
  return uniqueLogoSources(
    vendor?.logoUrl,
    ...officialIconSourcesFromUrl(officialUrl),
    githubAvatarUrl(githubOwnerFromVendor(vendor)),
  );
}

function logoForVendor(vendor) {
  return logoSourcesForVendor(vendor)[0] || "";
}

function placeholderLogoData(label) {
  const initial = String(label || "A").trim().charAt(0).toUpperCase() || "A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e6f4ef"/><text x="32" y="39" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#0f766e">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function applyNextLogoSource(event, label) {
  const remaining = event.currentTarget.dataset.fallbackSrcs ? event.currentTarget.dataset.fallbackSrcs.split("|").filter(Boolean) : [];
  const next = remaining.shift();
  if (next) {
    event.currentTarget.dataset.fallbackSrcs = remaining.join("|");
    event.currentTarget.src = next;
    return;
  }
  event.currentTarget.onerror = null;
  event.currentTarget.onload = null;
  event.currentTarget.src = placeholderLogoData(label);
}

function LogoImage({ sources, label }) {
  const [src, ...fallbacks] = uniqueLogoSources(...(sources || []));
  return <img alt="" src={src || placeholderLogoData(label)} data-fallback-srcs={fallbacks.join("|")} onError={(event) => applyNextLogoSource(event, label)} onLoad={(event) => {
    if (event.currentTarget.naturalWidth === 0) applyNextLogoSource(event, label);
  }} />;
}

function AgentLogo({ agent }) {
  return <LogoImage sources={logoSourcesForAgent(agent)} label={agent?.name || agent?.slug || "Agent"} />;
}

function VendorLogo({ vendor, fallbackClass = "vendor-logo vendor-logo-small", fallbackSize = 18 }) {
  const sources = logoSourcesForVendor(vendor);
  return sources.length ? <LogoImage sources={sources} label={vendor?.displayName || vendor?.name || "Vendor"} /> : <span className={fallbackClass}><Building2 size={fallbackSize} /></span>;
}

const modelProviderVendorIds = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  "github-copilot": "github",
};

function vendorForModelProvider(provider) {
  const key = slugify(provider || "");
  const vendorId = modelProviderVendorIds[key] || key;
  return vendorCatalog.find((vendor) => vendor.id === vendorId || slugify(vendor.name) === key || slugify(vendor.displayName) === key) || null;
}

function logoSourcesForModel(model) {
  const vendor = vendorForModelProvider(model?.provider);
  const officialUrl = firstNonGithubUrl(vendor?.website, model?.sourceUrl, vendor?.sourceUrl);
  return uniqueLogoSources(
    vendor?.logoUrl,
    ...officialIconSourcesFromUrl(officialUrl),
    ...officialIconSourcesFromUrl(model?.sourceUrl),
  );
}

function ModelLogo({ model }) {
  return <LogoImage sources={logoSourcesForModel(model)} label={model?.provider || model?.model || "Model"} />;
}

function formatNumber(value) {
  if (typeof value !== "number") return "--";
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}


function sortAgents(agents) {
  return [...agents].sort((a, b) => a.name.localeCompare(b.name));
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function numberValue(value, fallback = -Infinity) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compareNumberDesc(a, b, fallback = -Infinity) {
  const left = numberValue(a, fallback);
  const right = numberValue(b, fallback);
  if (left === right) return 0;
  return right - left;
}

function pricingSortParts(agent) {
  const type = agent.pricingType || agent.pricing?.type || "Unknown";
  const label = agent.pricingSummary || agent.price || agent.pricing?.display || "Unknown";
  const typeRank = { Free: 0, Freemium: 1, Paid: 2, Enterprise: 3, Unknown: 4 }[type] ?? 4;
  const amount = String(label).match(/\$([\d,]+(?:\.\d+)?)/);
  return { typeRank, amount: amount ? Number(amount[1].replace(/,/g, "")) : Number.MAX_SAFE_INTEGER, label };
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function parseNumberLike(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/[\d,.]+\s*([kKmMbB])?/);
  if (!match) return null;
  let number = Number(match[0].replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return null;
  const suffix = match[1]?.toLowerCase();
  if (suffix === "k") number *= 1000;
  if (suffix === "m") number *= 1000000;
  if (suffix === "b") number *= 1000000000;
  return number;
}

function logScore(value, maxLog = 8) {
  const number = parseNumberLike(value);
  if (!number || number <= 0) return 0;
  return clamp((Math.log10(number + 1) / maxLog) * 100);
}

function uptimeScore(agent) {
  const observed = parseNumberLike(agent.operationalMetrics?.uptime7dObservedPct);
  if (observed !== null) return clamp(observed);
  const uptime = agent.operationalMetrics?.uptime7d;
  if (typeof uptime === "string" && uptime.includes("100%")) return 100;
  if (typeof uptime === "string" && uptime.includes("0%")) return 0;
  const status = String(agent.operationalMetrics?.currentStatus || agent.operationalMetrics?.statusDescription || "").toLowerCase();
  if (status.includes("operational") || status === "none") return 85;
  if (status.includes("degradation") || status.includes("minor")) return 45;
  return 0;
}

function freshnessScore(value) {
  if (!value) return 0;
  const ageDays = (Date.now() - new Date(value).getTime()) / 86400000;
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 1) return 100;
  if (ageDays <= 7) return 75;
  if (ageDays <= 30) return 45;
  return 15;
}

function marketPositionScore(agent) {
  const priority = Number(agent.marketPosition?.rankPriority);
  if (!Number.isFinite(priority) || priority <= 0) return 0;
  return clamp(102 - priority * 2, 0, 100);
}

function evidenceCount(agent) {
  return [
    agent.githubMetric?.ok,
    parseNumberLike(agent.adoptionMetrics?.packageDownloadsMonthly) || parseNumberLike(agent.adoptionMetrics?.packageDownloadVelocity),
    agent.operationalMetrics?.statusFetchOk || agent.operationalMetrics?.statusDescription,
    agent.sourceCheck?.lastCheckedAt || agent.verifiedAt,
    agent.pricingPlans?.length,
    agent.marketPosition?.rankPriority,
  ].filter(Boolean).length;
}

function rankingScore(agent) {
  if (typeof agent.finalRank === "number" || typeof agent.final_rank === "number") {
    const score = Number(agent.finalRank ?? agent.final_rank);
    const freshness = Number(agent.freshnessScore ?? agent.freshness_score ?? 0);
    const relevance = Number(agent.relevanceScore ?? agent.relevance_score ?? score);
    return { score: Math.round(score), confidence: Math.round(clamp(Math.min(100, relevance))), adoption: 0, momentum: 0, reliability: 0, freshness: Math.round(freshness), market: Math.round(relevance) };
  }
  const githubAdoption = Math.max(logScore(agent.githubMetric?.stars, 6), logScore(agent.githubMetric?.forks, 5) * 0.7);
  const packageAdoption = logScore(agent.adoptionMetrics?.packageDownloadsMonthly || agent.adoptionMetrics?.packageDownloadVelocity, 8);
  const adoption = Math.max(githubAdoption, packageAdoption);
  const momentum = Math.max(
    clamp(((agent.githubMetric?.trend7dPct || 0) + 20) * 2.5),
    logScore(agent.githubMetric?.commitCount30d, 3),
    agent.sourceCheck?.status === "unchanged" || agent.sourceCheck?.status === "changed" ? 55 : 0
  );
  const reliability = uptimeScore(agent);
  const freshness = freshnessScore(agent.verifiedAt);
  const market = marketPositionScore(agent);
  const confidence = clamp((evidenceCount(agent) / 6) * 100);
  const sourceScore = adoption * 0.45 + momentum * 0.25 + reliability * 0.15 + freshness * 0.15;
  const score = Math.max(sourceScore, market);
  return {
    score: Math.round(score),
    confidence: Math.round(confidence),
    adoption: Math.round(adoption),
    momentum: Math.round(momentum),
    reliability: Math.round(reliability),
    freshness: Math.round(freshness),
    market: Math.round(market),
  };
}

function withCategoryRanks(agents) {
  return agents
    .map((agent) => ({ ...agent, ranking: rankingScore(agent) }))
    .sort((a, b) => b.ranking.score - a.ranking.score || b.ranking.confidence - a.ranking.confidence || a.name.localeCompare(b.name))
    .map((agent, index) => ({ ...agent, categoryRank: index + 1 }));
}

function cleanPath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isInternalAppRoute(pathname) {
  const path = cleanPath(pathname);
  if (path === "/") return true;
  const [prefix] = path.split("/").filter(Boolean);
  return appRoutePrefixes.has(prefix);
}

function applyRouteScrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  [document.querySelector(".main-shell"), document.querySelector(".content")].forEach((element) => {
    if (element?.scrollTo) element.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function scrollRouteToTop() {
  applyRouteScrollTop();
  window.requestAnimationFrame(applyRouteScrollTop);
  window.setTimeout(applyRouteScrollTop, 0);
}

function getRoute(pathname) {
  const path = cleanPath(pathname);
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "admin") {
    if (parts[1] === "research") return { section: "admin", page: "research-admin", slug: parts[2] || null, language: "en" };
    return { section: "admin", page: parts[1] ? "agent-editor" : "admin", slug: parts[1] || null, language: "en" };
  }
  if (parts[0] === "en") return { section: "public", page: parts[1] ? "agent-detail" : "overview", language: "en", slug: parts[1] || null };
  if (parts[0] === "ai") return { section: "public", page: parts[1] ? "agent-detail" : "ai", language: "en", slug: parts[1] || null };
  if (parts[0] === "agents") return { section: "public", page: parts[1] ? "agent-detail" : "agents", language: "en", slug: parts[1] || null };
  if (parts[0] === "vendors") {
    if (parts[1] && parts[2]) return { section: "public", page: "agent-detail", language: "en", vendorSlug: parts[1], slug: parts[2] };
    return { section: "public", page: parts[1] ? "vendor-detail" : "vendors", language: "en", vendorSlug: parts[1] || null, slug: parts[1] || null };
  }
  if (parts[0] === "research") return { section: "public", page: "research", language: "en", slug: null };
  if (parts[0] === "compare") return { section: "public", page: "compare", language: "en", slug: null };
  if (parts[0] === "use-cases") return { section: "public", page: parts[1] ? "use-case-detail" : "use-cases", language: "en", slug: parts[1] || null };
  if (parts[0] === "request-form" || parts[0] === "requests-form") return { section: "public", page: "request-form", language: "en", slug: null };
  if (["analytics", "learn", "assistant", "alerts", "saved", "api", "settings"].includes(parts[0])) return { section: "public", page: parts[0], language: "en", slug: null };
  if (parts[0]) return { section: "public", page: "agent-detail", language: "en", slug: parts[0] };
  return { section: "public", page: "overview", language: "en", slug: null };
}

function MiniTrend({ value }) {
  const hasTrend = typeof value === "number";
  const positive = hasTrend && value >= 0;
  const trendClass = hasTrend ? (positive ? "positive" : "negative") : "empty";
  const trendLabel = hasTrend ? (positive ? "+" : "") + value + "%" : "No trend";
  return (
    <div className={"trend " + trendClass} aria-label={hasTrend ? "7 day star trend " + value + "%" : "No trend history yet"}>
      <span />
      <span />
      <span />
      <em>{trendLabel}</em>
    </div>
  );
}

function applyDocumentLogo() {
  let favicon = document.querySelector('link[rel="icon"]');
  if (favicon == null) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.type = "image/png";
  favicon.href = appurdexLogoUrl;
}

function Sidebar({ navigate, path }) {
  const activePath = cleanPath(path === "/en" ? "/" : path);
  return (
    <aside className="sidebar">
      <button className="brand-block brand-button" type="button" onClick={() => navigate("/")}>
        <img className="brand-icon" src={appurdexLogoUrl} alt="" />
        <strong>Appurdex</strong>
        <span>BETA</span>
      </button>
      <nav className="nav-list" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const count = item.count;
          const active = item.path === "/" ? activePath === "/" || activePath === "/vendors" || activePath.startsWith("/vendors/") || activePath === "/ai" || activePath.startsWith("/ai/") : activePath === item.path || activePath.startsWith(item.path + "/");
          return (
            <button className={active ? "active" : ""} key={item.label} type="button" onClick={() => navigate(item.path)}>
              <Icon size={18} />
              <span>{item.label}</span>
              {typeof count === "number" ? <b>{count}</b> : null}
            </button>
          );
        })}
      </nav>
      <nav className="nav-list lower" aria-label="Secondary">
        {lowerNav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" onClick={() => navigate(item.path)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <footer className="sidebar-footer">2026 Appurdex</footer>
    </aside>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#fbbc05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.23 1 12s.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.43 12.64c-.03-2.67 2.18-3.95 2.28-4.01-1.24-1.81-3.17-2.06-3.85-2.09-1.64-.17-3.2.96-4.03.96-.84 0-2.13-.94-3.5-.91-1.8.03-3.46 1.05-4.39 2.66-1.87 3.24-.48 8.04 1.35 10.67.89 1.29 1.96 2.74 3.36 2.69 1.35-.05 1.86-.87 3.49-.87 1.63 0 2.09.87 3.51.84 1.45-.03 2.37-1.31 3.25-2.61 1.03-1.5 1.45-2.95 1.47-3.03-.03-.01-2.83-1.08-2.86-4.3Zm-2.65-7.83c.74-.9 1.24-2.15 1.1-3.39-1.06.04-2.35.71-3.11 1.6-.68.79-1.28 2.06-1.12 3.27 1.19.09 2.4-.6 3.13-1.48Z" />
    </svg>
  );
}

function displayUsername(user) {
  if (user?.username) return user.username;
  const seed = String(user?.id || user?.email || "user").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6) || "user";
  return "appur-" + seed;
}

function AccountMark({ signedIn }) {
  return (
    <span className={signedIn ? "account-mark signed-in" : "account-mark signed-out"}>
      {signedIn ? <img src={appurdexLogoUrl} alt="" /> : <KeyRound size={15} />}
    </span>
  );
}

function AccountTrigger({ user, onClick }) {
  const signedIn = Boolean(user);
  const label = signedIn ? "Open account" : "Sign in";
  return (
    <button className={signedIn ? "account-pill signed-in" : "account-pill signed-out"} type="button" aria-label={label} title={label} onClick={onClick}>
      <span className="account-pill-lines" aria-hidden="true"><i /><i /><i /></span>
      <AccountMark signedIn={signedIn} />
    </button>
  );
}
function AuthModal({ viewer, backendAvailable, reloadViewer, onClose, navigate }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const user = viewer?.user || null;
  const config = viewer?.config || {};
  const emailReady = Boolean(config.emailMagicLink);
  const googleReady = Boolean(config.google);
  const appleReady = false;
  const unavailableReason = backendAvailable ? "Not configured" : "Backend offline";
  const appleLockedReason = "Locked for now";
  const username = displayUsername(user);
  const [assistantVisible, setAssistantVisible] = useState(() => window.localStorage.getItem("appurdex-ai-assistant") !== "hidden");

  function setAssistantPreference(visible) {
    setAssistantVisible(visible);
    window.localStorage.setItem("appurdex-ai-assistant", visible ? "shown" : "hidden");
  }

  function openAccountRoute(path) {
    onClose();
    navigate(path);
  }

  async function handleEmailStart(event) {
    event.preventDefault();
    setMessage("");
    try {
      await startEmailSignIn(email);
      setMessage("Magic link sent. Check the email address you entered.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleLogout() {
    setMessage("");
    try {
      await logoutViewer();
      await reloadViewer();
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (user) {
    return (
      <div className="account-popover-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
        <section className="account-popover-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <div className="account-popover-profile">
            <AccountMark signedIn />
            <div>
              <h1 id="auth-modal-title">Hi, {username}</h1>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="account-popover-menu">
            <button type="button" onClick={() => openAccountRoute("/api")}><KeyRound size={16} />API Dashboard</button>
            <button type="button" onClick={() => openAccountRoute("/settings")}><Languages size={16} />Language</button>
            <button type="button" onClick={() => openAccountRoute("/api")}><CircleDollarSign size={16} />Appurdex AI Subscription</button>
            <button type="button" onClick={() => openAccountRoute("/assistant")}><Bot size={16} />Open Appurdex AI</button>
            <div className="account-menu-toggle-row">
              <span>Appurdex AI Assistant</span>
              <div>
                <button className={assistantVisible ? "active" : ""} type="button" onClick={() => setAssistantPreference(true)}>Show</button>
                <button className={!assistantVisible ? "active" : ""} type="button" onClick={() => setAssistantPreference(false)}>Hide</button>
              </div>
            </div>
            <button type="button" onClick={() => openAccountRoute("/settings")}><Settings size={16} />Settings</button>
            <button type="button" onClick={handleLogout}><LogOut size={16} />Logout</button>
          </div>
          {message ? <p className="api-message auth-message"><strong>Status</strong><span>{message}</span></p> : null}
        </section>
      </div>
    );
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="update-modal-card auth-modal-card">
        <div className="request-head">
          <div>
            <h1 id="auth-modal-title">Sign in to Appurdex</h1>
            <p>Use a configured sign-in method to access account features.</p>
          </div>
          <button className="icon-only close-button" type="button" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="auth-provider-list">
          <button className="auth-provider-button" type="button" disabled={!backendAvailable || !googleReady} onClick={() => { window.location.href = authNavigationUrl("/api/auth/google/start"); }}>
            <span className="auth-provider-icon"><GoogleIcon /></span>
            <span>Continue via Google</span>
            {(!backendAvailable || !googleReady) ? <small>{unavailableReason}</small> : null}
          </button>
          <button className="auth-provider-button" type="button" disabled title="Apple login is locked for now.">
            <span className="auth-provider-icon apple"><AppleIcon /></span>
            <span>Continue via Apple</span>
            <small>{appleLockedReason}</small>
          </button>
        </div>
        <form className="auth-email-form" onSubmit={handleEmailStart}>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
          </label>
          <button className="auth-provider-button" type="submit" disabled={!backendAvailable || !emailReady}>
            <span className="auth-provider-icon email"><Mail size={18} /></span>
            <span>Continue via email</span>
            {(!backendAvailable || !emailReady) ? <small>{unavailableReason}</small> : null}
          </button>
        </form>
        {message ? <p className="api-message auth-message"><strong>Status</strong><span>{message}</span></p> : null}
      </section>
    </div>
  );
}
function Topbar({ agents, vendors = [], modelPricing = [], navigate, setFilters, theme, toggleTheme, viewer, backendAvailable, reloadViewer }) {
  const isDark = theme === "dark";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const normalized = query.trim().toLowerCase();
  const visibleSearchResults = useMemo(() => {
    if (!normalized) return [];
    const ranked = [];
    vendors.forEach((vendor) => {
      const rank = Math.min(searchRank(vendor.displayName || vendor.name, normalized), searchRank(searchableTextForVendor(vendor), normalized) + 1);
      if (Number.isFinite(rank)) ranked.push({ type: "vendor", key: "vendor-" + vendor.id, vendor, rank, typeRank: 0 });
    });
    agents.filter(hasDirectoryData).forEach((agent) => {
      const rank = Math.min(searchRank(agent.name, normalized), searchRank(searchableTextForAgent(agent), normalized) + 1);
      if (Number.isFinite(rank)) ranked.push({ type: "agent", key: "agent-" + (agent.slug || agent.id || agent.name), agent, rank, typeRank: 1 });
    });
    (modelPricing || []).forEach((model) => {
      const rank = Math.min(searchRank(model.model, normalized), searchRank(model.modelId, normalized), searchRank(modelSearchText(model), normalized) + 1);
      if (Number.isFinite(rank)) ranked.push({ type: "model", key: "model-" + model.id, model, rank, typeRank: 2 });
    });
    const searchableUseCases = populatedUseCases(agents.filter(hasDirectoryData), APPURDEX_USE_CASE_GROUP, 3);
    searchableUseCases.forEach((useCase) => {
      const rank = Math.min(searchRank(useCase.label, normalized), searchRank(useCaseSearchText(useCase), normalized) + 1);
      if (Number.isFinite(rank)) ranked.push({ type: "useCase", key: "usecase-" + useCase.slug, useCase, rank, typeRank: 3 });
    });
    return ranked
      .sort((a, b) => a.rank - b.rank || a.typeRank - b.typeRank || compareText(a.vendor?.displayName || a.agent?.name || a.model?.model || a.useCase?.label, b.vendor?.displayName || b.agent?.name || b.model?.model || b.useCase?.label))
      .slice(0, 10);
  }, [agents, vendors, modelPricing, normalized]);

  function submitSearch(event) {
    event.preventDefault();
    const submitted = query.trim();
    if (!submitted) return;
    const submittedKey = submitted.toLowerCase();
    const exactVendor = vendors.find((vendor) => [vendor.displayName, vendor.name, vendor.id].filter(Boolean).some((value) => String(value).toLowerCase() === submittedKey));
    const exactModel = (modelPricing || []).find((model) => [model.model, model.modelId, model.id].filter(Boolean).some((value) => String(value).toLowerCase() === submittedKey));
    if (exactVendor) {
      setQuery("");
      setOpen(false);
      navigate("/vendors/" + exactVendor.id);
      return;
    }
    if (exactModel) {
      setQuery("");
      setOpen(false);
      navigate("/compare");
      return;
    }
    setFilters({
      ...DEFAULT_FILTERS,
      query: submitted,
      useCase: useCaseForSearchQuery(submitted),
    });
    setOpen(false);
    navigate("/ai");
  }

  function chooseResult(result) {
    if (result.type === "agent") {
      setQuery("");
      setOpen(false);
      navigate(result.agent.publicPath);
      return;
    }
    if (result.type === "vendor") {
      setQuery("");
      setOpen(false);
      navigate("/vendors/" + result.vendor.id);
      return;
    }
    if (result.type === "model") {
      setQuery("");
      setOpen(false);
      navigate("/compare");
      return;
    }
    if (result.type === "useCase") {
      setQuery("");
      setOpen(false);
      setFilters({ ...DEFAULT_FILTERS, useCase: result.useCase.label });
      navigate("/use-cases/" + result.useCase.slug);
    }
  }

  function renderSearchResult(result) {
    if (result.type === "vendor") {
      const vendor = result.vendor;
      return (
        <button type="button" key={result.key} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseResult(result)}>
          <VendorLogo vendor={vendor} />
          <span>
            <strong>{vendor.displayName || vendor.name}</strong>
            <small>{(vendor.ecosystems || []).join(", ") || "Vendor"} / {(vendor.categories || []).join(", ") || "No category"}</small>
          </span>
          <span className="category-pill blue">Vendor</span>
        </button>
      );
    }
    if (result.type === "model") {
      const model = result.model;
      return (
        <button type="button" key={result.key} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseResult(result)}>
          <span className="model-provider-mark">{model.provider?.charAt(0) || "M"}</span>
          <span>
            <strong>{model.model}</strong>
            <small>{model.provider} / {model.modelFamily || "Model pricing"} / {model.status || "current"}</small>
          </span>
          <span className="category-pill green">Model</span>
        </button>
      );
    }
    if (result.type === "useCase") {
      return (
        <button type="button" key={result.key} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseResult(result)}>
          <span className="model-provider-mark"><Search size={14} /></span>
          <span>
            <strong>{result.useCase.label}</strong>
            <small>{result.useCase.description}</small>
          </span>
          <span className="category-pill purple">Use case</span>
        </button>
      );
    }
    const agent = result.agent;
    return (
      <button type="button" key={result.key} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseResult(result)}>
        <AgentLogo agent={agent} />
        <span>
          <strong>{agent.name}</strong>
          <small>{agent.ecosystem} / {agent.displayCategory} / {useCasesForAgent(agent).join(", ") || "No use case"}</small>
        </span>
        <span className={"category-pill " + (categoryClass[agent.category] || "blue")}>Agent</span>
      </button>
    );
  }

  return (
    <>
    <header className="topbar">
      <form className="global-search-shell" onSubmit={submitSearch} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <label className="global-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search vendors, agents, models, use cases..."
            aria-label="Search vendors, AI agents, models, and use cases"
          />
          <kbd>/</kbd>
        </label>
        {open && normalized ? (
          <div className="compare-agent-results global-search-results" role="listbox" aria-label="Search results">
            {visibleSearchResults.length ? visibleSearchResults.map(renderSearchResult) : <p>No source-backed results match this search.</p>}
            <button className="global-search-submit" type="submit">
              <Search size={15} />
              <span>
                <strong>View all directory results</strong>
                <small>Search agents and use cases for "{query.trim()}"</small>
              </span>
            </button>
          </div>
        ) : null}
      </form>
      <div className="top-actions">
        <button
          className="icon-only"
          type="button"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <AccountTrigger user={viewer?.user} onClick={() => setAuthOpen(true)} />
      </div>
    </header>
    {authOpen ? <AuthModal viewer={viewer} backendAvailable={backendAvailable} reloadViewer={reloadViewer} navigate={navigate} onClose={() => setAuthOpen(false)} /> : null}
    </>
  );
}function FilterSelect({ label, value, options, onChange, name, open, onToggle, onClose }) {
  const choices = ["All", ...options];

  function choose(option) {
    onChange(option);
    onClose();
  }

  return (
    <div className={open ? "filter-select-wrap open" : "filter-select-wrap"} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onClose();
    }}>
      <button className="filter-select" type="button" aria-expanded={open} aria-haspopup="listbox" onClick={onToggle}>
        <span>{label}</span>
        <strong>{value}</strong>
        <ChevronDown className="filter-chevron" size={15} />
      </button>
      {open ? (
        <div className="filter-menu" role="listbox" aria-label={label} tabIndex={-1}>
          {choices.map((option) => {
            const selected = option === value;
            return (
              <button className={selected ? "selected" : ""} type="button" role="option" aria-selected={selected} key={name + "-" + option} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
                <span>{option}</span>
                {selected ? <CheckCircle2 size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}


function PriceRangeFilter({ value, onChange, open, onToggle, onClose }) {
  const rangeValue = value && typeof value === "object" ? value : { min: "", max: value || "" };
  const minValue = String(rangeValue.min || "");
  const maxValue = String(rangeValue.max || "");
  const minNumber = Number(minValue);
  const maxNumber = Number(maxValue);
  const hasMin = minValue.trim() !== "" && Number.isFinite(minNumber) && minNumber >= 0;
  const hasMax = maxValue.trim() !== "" && Number.isFinite(maxNumber) && maxNumber >= 0;
  const label = hasMin && hasMax
    ? "$" + minNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "-$" + maxNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "/mo"
    : hasMin
      ? "$" + minNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "+/mo"
      : hasMax
        ? "Up to $" + maxNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "/mo"
        : "Any budget";
  const presets = [
    { label: "Up to $20", min: "", max: "20" },
    { label: "Up to $100", min: "", max: "100" },
    { label: "$15-$20", min: "15", max: "20" },
    { label: "$15-$50", min: "15", max: "50" },
    { label: "$50-$200", min: "50", max: "200" },
    { label: "$200+", min: "200", max: "" },
  ];

  function cleanNumber(nextValue) {
    const cleaned = nextValue.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
  }

  function updateRange(key, nextValue) {
    onChange({ ...rangeValue, [key]: cleanNumber(nextValue) });
  }

  function presetSelected(preset) {
    return minValue === preset.min && maxValue === preset.max;
  }

  return (
    <div className={open ? "filter-select-wrap price-range-filter budget-filter open" : "filter-select-wrap price-range-filter budget-filter"} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onClose();
    }}>
      <button className="filter-select" type="button" aria-expanded={open} aria-haspopup="dialog" onClick={onToggle}>
        <span>Budget</span>
        <strong>{label}</strong>
        <ChevronDown className="filter-chevron" size={15} />
      </button>
      {open ? (
        <div className="filter-menu price-range-menu budget-menu" role="dialog" aria-label="Monthly budget" tabIndex={-1}>
          <div className="budget-range-grid">
            <label className="budget-input-label">
              <span>From</span>
              <div className="budget-input-wrap">
                <CircleDollarSign size={16} />
                <input autoFocus inputMode="decimal" min="0" type="text" value={minValue} placeholder="15" onChange={(event) => updateRange("min", event.target.value)} />
              </div>
            </label>
            <label className="budget-input-label">
              <span>To</span>
              <div className="budget-input-wrap">
                <CircleDollarSign size={16} />
                <input inputMode="decimal" min="0" type="text" value={maxValue} placeholder="50" onChange={(event) => updateRange("max", event.target.value)} />
              </div>
            </label>
          </div>
          <div className="budget-presets" aria-label="Budget presets">
            {presets.map((preset) => {
              const selectedPreset = presetSelected(preset);
              return <button className={selectedPreset ? "selected" : ""} type="button" key={preset.label} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange({ min: preset.min, max: preset.max })}><span>{preset.label}</span>{selectedPreset ? <CheckCircle2 size={14} /> : null}</button>;
            })}
          </div>
          <div className="budget-menu-actions">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange({ min: "", max: "" })} disabled={!minValue && !maxValue}>Clear</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>Done</button>
          </div>
          <small>Type a monthly range or pick a preset. Results match verified monthly pricing inside the range.</small>
        </div>
      ) : null}
    </div>
  );
}
function sourceAvailability(agent) {
  return agent.hasPublicRepo ? "Public repo" : "Closed source";
}

function externalUrlFor(agent) {
  return websiteUrlFor(agent);
}

function websiteUrlFor(agent) {
  const githubUrl = agent.githubRepo ? `https://github.com/${agent.githubRepo}` : "";
  return firstNonGithubUrl(agent.website, agent.sourceUrl) || agent.website || agent.sourceUrl || githubUrl;
}

const VENDOR_RANK_PRIORITY = {
  openai: 1,
  anthropic: 2,
  github: 3,
  cognition: 4,
  cursor: 5,
  google: 6,
  aws: 7,
};

function vendorForAgent(agent) {
  const productKey = agent.id || agent.slug || slugify(agent.name);
  const githubOwner = agent.githubRepo ? String(agent.githubRepo).split('/')[0] : "";
  const vendorId = agent.vendorId || vendorProductMap[productKey] || (agent.vendorName ? slugify(agent.vendorName) : "") || (githubOwner ? slugify(githubOwner) : "");
  if (!vendorId) return null;
  const catalogVendor = vendorCatalog.find((vendor) => vendor.id === vendorId);
  return {
    ...(catalogVendor || {}),
    id: vendorId,
    name: agent.vendorName || catalogVendor?.name || githubOwner || vendorId,
    displayName: agent.vendorDisplayName || catalogVendor?.displayName || agent.vendorName || catalogVendor?.name || githubOwner || vendorId,
    website: agent.vendorWebsite || catalogVendor?.website || "",
    sourceUrl: agent.vendorSourceUrl || catalogVendor?.sourceUrl || (githubOwner ? `https://github.com/${githubOwner}` : "") || agent.sourceUrl || agent.website || "",
    sourceLabel: agent.vendorSourceLabel || catalogVendor?.sourceLabel || (githubOwner ? "GitHub owner" : agent.sourceLabel) || "Official source",
  };
}

function vendorRankValue(vendor) {
  const vendorRank = Number(VENDOR_RANK_PRIORITY[vendor.id]);
  if (Number.isFinite(vendorRank) && vendorRank > 0) return vendorRank;
  const productRank = Number(vendor.rankPriority);
  return Number.isFinite(productRank) && productRank > 0 ? productRank : Infinity;
}

function buildVendorRows(agents) {
  const rowsByVendor = new Map();
  agents.filter((agent) => {
    const hasSource = Boolean(agent.sourceUrl || agent.website || agent.githubRepo || agent.sourceUrls?.length);
    return hasSource && vendorForAgent(agent);
  }).forEach((agent) => {
    const vendor = vendorForAgent(agent);
    if (!vendor) return;
    const current = rowsByVendor.get(vendor.id) || { ...vendor, agents: [], ecosystems: new Set(), categories: new Set(), latestSyncedAt: null, rankPriority: null };
    const agentKey = agent.id || agent.slug || agent.name;
    if (current.agents.some((existing) => (existing.id || existing.slug || existing.name) === agentKey)) {
      rowsByVendor.set(vendor.id, current);
      return;
    }
    current.agents.push(agent);
    const agentRank = Number(agent.marketPosition?.rankPriority);
    if (Number.isFinite(agentRank) && agentRank > 0 && (!current.rankPriority || agentRank < current.rankPriority)) current.rankPriority = agentRank;
    current.ecosystems.add(agent.ecosystem || "Agents");
    current.categories.add(agent.displayCategory || agent.category || "Uncategorized");
    const syncedAt = agent.lastSyncedAt || agent.last_synced_at;
    if (syncedAt && (!current.latestSyncedAt || new Date(syncedAt) > new Date(current.latestSyncedAt))) current.latestSyncedAt = syncedAt;
    rowsByVendor.set(vendor.id, current);
  });
  return [...rowsByVendor.values()]
    .map((row) => ({ ...row, ecosystems: [...row.ecosystems].sort(), categories: [...row.categories].sort() }))
    .sort((a, b) => vendorRankValue(a) - vendorRankValue(b) || b.agents.length - a.agents.length || a.name.localeCompare(b.name));
}

function normalizeSocialUrl(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^@/, "")}`;
}

function socialLinksFor(agent) {
  const sourceLinks = [
    ...(Array.isArray(agent.socialLinks) ? agent.socialLinks : []),
    ...(Array.isArray(agent.socials) ? agent.socials : []),
  ];
  const directLinks = [
    { key: "github", label: "GitHub", url: agent.githubRepo ? `https://github.com/${agent.githubRepo}` : "", icon: Code2 },
    { key: "twitter", label: "X", url: agent.twitterUrl || agent.xUrl || agent.socialTwitter || agent.socialX, icon: X },
    { key: "linkedin", label: "LinkedIn", url: agent.linkedinUrl || agent.socialLinkedin, icon: ExternalLink },
    { key: "youtube", label: "YouTube", url: agent.youtubeUrl || agent.ytUrl || agent.socialYoutube, icon: ExternalLink },
    { key: "instagram", label: "Instagram", url: agent.instagramUrl || agent.socialInstagram, icon: ExternalLink },
  ];
  const normalized = [...directLinks, ...sourceLinks.map((link) => ({
    key: link.key || link.type || link.label,
    label: link.label || link.type || "Social",
    url: link.url || link.href,
    icon: link.type === "github" ? Code2 : link.type === "twitter" || link.type === "x" ? X : ExternalLink,
  }))]
    .map((link) => ({ ...link, url: normalizeSocialUrl(link.url) }))
    .filter((link) => link.url);
  const seen = new Set();
  return normalized.filter((link) => {
    const key = link.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function DirectorySocialLinks({ agent }) {
  const links = socialLinksFor(agent).filter((link) => ["twitter", "x", "linkedin", "youtube", "instagram"].includes(String(link.key || "").toLowerCase()));
  if (!links.length) return null;
  return (
    <span className="directory-social-links" aria-label={agent.name + " social links"}>
      {links.map((link) => { const Icon = link.icon || ExternalLink; return <a key={link.url} href={link.url} target="_blank" rel="noreferrer" title={link.label} aria-label={agent.name + " " + link.label}><Icon size={13} /></a>; })}
    </span>
  );
}

function sourceFor(agent, kind) {
  return agent.sourceUrls?.find((source) => source.kind === kind) || null;
}

function uniqueValues(agents, getValue) {
  return [...new Set(agents.map(getValue).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hasDirectoryData(agent) {
  return Boolean(agent.verifiedAt && agent.ecosystem !== "MCP Servers");
}

function keywordMatches(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[a-z0-9/+.-]{1,3}$/i.test(keyword)) return new RegExp("\\b" + escaped + "\\b").test(text);
  return text.includes(keyword);
}

function useCasesForAgent(agent) {
  return normalizeUseCases(agent?.use_cases).map(useCaseLabel);
}

function textList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item) return "";
      if (typeof item === "object") return Object.values(item).filter(Boolean).join(" ");
      return String(item);
    }).join(" ");
  }
  return value ? String(value) : "";
}

function searchableTextForAgent(agent, useCases = useCasesForAgent(agent)) {
  const providers = Array.isArray(agent.modelSupport?.providers) ? agent.modelSupport.providers.join(" ") : "";
  const vendor = vendorForAgent(agent);
  return [
    agent.name,
    agent.description,
    agent.ecosystem,
    agent.displayCategory,
    agent.category,
    agent.price,
    agent.access,
    agent.hosting,
    agent.githubRepo,
    vendor?.displayName,
    vendor?.name,
    vendor?.id,
    agent.modelSupport?.flexibility,
    agent.modelSupport?.modelChoice,
    providers,
    textList(agent.sourceUrls?.map((source) => [source?.label, source?.kind, source?.url].filter(Boolean).join(" "))),
    textList(agent.integrations),
    agent.discovery?.sourceQuery,
    textList(agent.discovery?.topics),
    sourceAvailability(agent),
    textList(agent.use_cases),
    useCases.join(" "),
  ].filter(Boolean).join(" ");
}

function searchableTextForVendor(vendor) {
  return [
    vendor.displayName,
    vendor.name,
    vendor.id,
    vendor.website,
    vendor.sourceUrl,
    textList(vendor.ecosystems),
    textList(vendor.categories),
    textList((vendor.agents || []).map((agent) => [agent.name, agent.displayCategory].join(" "))),
  ].filter(Boolean).join(" ");
}

function useCaseForSearchQuery(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return "All";
  const match = APPURDEX_USE_CASES.find((useCase) => {
    const label = useCase.label.toLowerCase();
    const slugText = useCase.slug.replace(/_/g, " ");
    return label === normalizedQuery || useCase.slug === normalizedQuery || slugText === normalizedQuery || taxonomyUseCaseSearchText(useCase).includes(normalizedQuery);
  });
  return match?.label || "All";
}

function useCaseSearchText(useCase) {
  return taxonomyUseCaseSearchText(useCase);
}

function searchRank(text, query) {
  const haystack = String(text || "").toLowerCase();
  const needle = String(query || "").toLowerCase();
  if (!needle || !haystack.includes(needle)) return Infinity;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (new RegExp("(^|[^a-z0-9])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(haystack)) return 2;
  return 3;
}
function directoryTimestampValue(agent) {
  const values = [
    agent.lastSyncedAt,
    agent.last_synced_at,
    agent.verifiedAt,
    agent.lastVerifiedAt,
    agent.lastCuratedAt,
    agent.discovery?.discoveredAt,
    agent.createdAt,
    agent.created_at,
  ].map(dateValue).filter((value) => value > 0);
  return values.length ? Math.max(...values) : 0;
}

function sortRows(rows, sort) {
  const sorted = [...rows];
  if (sort === "Newest" || sort === "Last updated") return sorted.sort((a, b) => directoryTimestampValue(b) - directoryTimestampValue(a) || compareText(a.name, b.name));
  if (sort === "Oldest") return sorted.sort((a, b) => directoryTimestampValue(a) - directoryTimestampValue(b) || compareText(a.name, b.name));
  if (sort === "Score") return sorted.sort((a, b) => (a.categoryRank || 999) - (b.categoryRank || 999));
  if (sort === "Popularity") return sorted.sort((a, b) => (b.ranking?.score || 0) - (a.ranking?.score || 0));
  if (sort === "Stars") return sorted.sort((a, b) => compareNumberDesc(a.githubMetric?.stars, b.githubMetric?.stars) || compareText(a.name, b.name));
  if (sort === "Trend 7d") return sorted.sort((a, b) => compareNumberDesc(a.githubMetric?.trend7dPct, b.githubMetric?.trend7dPct) || compareText(a.name, b.name));
  if (sort === "Category") return sorted.sort((a, b) => compareText(a.displayCategory || a.category, b.displayCategory || b.category) || compareText(a.name, b.name));
  if (sort === "Pricing") return sorted.sort((a, b) => {
    const aPrice = pricingSortParts(a);
    const bPrice = pricingSortParts(b);
    return aPrice.typeRank - bPrice.typeRank || aPrice.amount - bPrice.amount || compareText(aPrice.label, bPrice.label) || compareText(a.name, b.name);
  });
  if (sort === "Access") return sorted.sort((a, b) => compareText(a.access, b.access) || compareText(a.name, b.name));
  if (sort === "Hosting") return sorted.sort((a, b) => compareText(a.hosting, b.hosting) || compareText(a.name, b.name));
  if (sort === "Repo / Docs") return sorted.sort((a, b) => compareText(a.githubRepo || websiteUrlFor(a), b.githubRepo || websiteUrlFor(b)) || compareText(a.name, b.name));
  if (sort === "Freshness") return sorted.sort((a, b) => numberValue(b.freshnessScore ?? b.freshness_score, 0) - numberValue(a.freshnessScore ?? a.freshness_score, 0) || directoryTimestampValue(b) - directoryTimestampValue(a) || compareText(a.name, b.name));
  if (sort === "Name") return sorted.sort((a, b) => compareText(a.name, b.name));
  return sorted.sort((a, b) => directoryTimestampValue(b) - directoryTimestampValue(a) || compareText(a.name, b.name));
}

function DirectorySortHeader({ label, sort, currentSort, onSort }) {
  const active = currentSort === sort;
  const descending = ["Newest", "Last updated", "Freshness", "Trend 7d", "Popularity", "Stars"].includes(sort);
  return (
    <th className={active ? "sort-column" : undefined} aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button className={active ? "table-sort-header active" : "table-sort-header"} type="button" onClick={() => onSort(sort)} aria-label={"Sort by " + label}>
        <span>{label}</span>
        {active ? <ArrowDown className={descending ? undefined : "sort-ascending"} size={13} /> : null}
      </button>
    </th>
  );
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (currentPage >= totalPages - 3) return [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
}

function FilterRail({ agents, filters, setFilters, showEcosystem = true, sortOptions = DIRECTORY_SORT_OPTIONS }) {
  const [openFilter, setOpenFilter] = useState(null);
  const options = useMemo(() => ({
    ecosystem: uniqueValues(agents, (agent) => agent.ecosystem),
    category: uniqueValues(agents, (agent) => agent.displayCategory),
    access: uniqueValues(agents, (agent) => agent.access),
    useCase: USE_CASE_OPTIONS,
    modelFlex: ["Single-model", "Multi-model", "Provider-locked"],
    publicRepo: ["Yes", "No"],
    sortBy: sortOptions,}), [agents, sortOptions]);
  function setFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  function dropdownProps(key) { return { name: key, open: openFilter === key, onToggle: () => setOpenFilter((current) => current === key ? null : key), onClose: () => setOpenFilter(null) }; }
  function resetFilters() { setOpenFilter(null); setFilters(DEFAULT_FILTERS); }
  const priceBudgetActive = filters.priceBudget && typeof filters.priceBudget === "object"
    ? String(filters.priceBudget.min || "").trim() || String(filters.priceBudget.max || "").trim()
    : String(filters.priceBudget || "").trim();
  const activeFilterCount = [
    filters.query.trim(),
    showEcosystem && filters.ecosystem !== "All",
    filters.category !== "All",
    priceBudgetActive,
    filters.access !== "All",
    filters.useCase !== "All",
    filters.modelFlex !== "All",
    filters.publicRepo !== "All",
    filters.sortBy !== DEFAULT_FILTERS.sortBy,
  ].filter(Boolean).length;
  return (
    <div className={showEcosystem ? "filter-rail" : "filter-rail compact"}>
      {showEcosystem ? <FilterSelect label="Ecosystem" value={filters.ecosystem} options={options.ecosystem} onChange={(value) => setFilter("ecosystem", value)} {...dropdownProps("ecosystem")} /> : null}
      <FilterSelect label="Category" value={filters.category} options={options.category} onChange={(value) => setFilter("category", value)} {...dropdownProps("category")} />
      <PriceRangeFilter value={filters.priceBudget} onChange={(value) => setFilter("priceBudget", value)} {...dropdownProps("priceBudget")} />
      <FilterSelect label="Access" value={filters.access} options={options.access} onChange={(value) => setFilter("access", value)} {...dropdownProps("access")} />
      <FilterSelect label="Use case" value={filters.useCase} options={options.useCase} onChange={(value) => setFilter("useCase", value)} {...dropdownProps("useCase")} />
      <FilterSelect label="Model flexibility" value={filters.modelFlex} options={options.modelFlex} onChange={(value) => setFilter("modelFlex", value)} {...dropdownProps("modelFlex")} />
      <FilterSelect label="Has public repo" value={filters.publicRepo} options={options.publicRepo} onChange={(value) => setFilter("publicRepo", value)} {...dropdownProps("publicRepo")} />
      <FilterSelect label="Sort by" value={filters.sortBy} options={options.sortBy} onChange={(value) => setFilter("sortBy", value)} {...dropdownProps("sortBy")} />
      <button className={activeFilterCount ? "filter-button has-active-filters" : "filter-button"} type="button" onClick={resetFilters} disabled={!activeFilterCount} title={activeFilterCount ? "Clear active filters" : "No active filters"}>
        <Filter size={16} />{activeFilterCount ? `Clear ${activeFilterCount}` : "Clear"}
      </button>
    </div>
  );
}

function pricingChipForAgent(agent) {
  const type = agent.pricingType || agent.pricing?.type || 'Unknown';
  const summary = standardizePricingAmount(agent.pricingSummary || agent.price || agent.pricing?.display || 'Unknown');
  const amount = summary.match(/\$[\d,]+(?:\.\d+)?(?:[kKmM])?/i)?.[0] || null;
  const lower = summary.toLowerCase();
  if (summary === 'Unknown') return { label: 'Unknown', tone: 'unknown' };
  if (/^free$/i.test(summary) || type === 'Free') return { label: 'Free', tone: 'free' };
  if (/enterprise|contact|custom|sales/.test(lower) || type === 'Enterprise') return { label: 'Enterprise', tone: 'enterprise' };
  if (type === 'Freemium' || /free|freemium/.test(lower)) {
    if (amount) return { label: 'Freemium \u00b7 From ' + amount + '/mo', tone: 'freemium' };
    if (/usage|credit|varies/.test(lower)) return { label: 'Freemium \u00b7 Usage-based', tone: 'freemium' };
    return { label: 'Freemium', tone: 'freemium' };
  }
  if (amount) return { label: 'Paid \u00b7 From ' + amount + '/mo', tone: 'paid' };
  if (/usage|credit|varies/.test(lower)) return { label: 'Paid \u00b7 Usage-based', tone: 'paid' };
  return { label: summary, tone: type === 'Paid' ? 'paid' : 'unknown' };
}

function PricingCell({ agent }) {
  const chip = pricingChipForAgent(agent);
  return <span className={'pricing-chip ' + chip.tone}>{chip.label}</span>;
}

function VendorCell({ agent, navigate }) {
  const vendor = vendorForAgent(agent);
  if (!vendor) return <span className="metric-na">N/A</span>;
  return <button className="vendor-link" type="button" onClick={() => navigate('/vendors/' + vendor.id)}>{vendor.displayName || vendor.name}</button>;
}

function AgentRow({ agent, navigate, showTrend = true, showVendor = false }) {
  const fresh = { label: agent.syncAgeLabel ? "Last updated " + agent.syncAgeLabel : "Last updated: not synced", tone: agent.syncAgeTone || "unknown" };
  const websiteUrl = websiteUrlFor(agent);
  return (
    <tr>
      <td><div className="agent-cell"><AgentLogo agent={agent} /><div><div className="agent-title"><button className="agent-name-button" type="button" onClick={() => navigate(agent.publicPath)}>{agent.name}</button><DirectorySocialLinks agent={agent} /></div><p>{agent.description}</p></div></div></td>
      <td><span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span></td>
      {showVendor ? <td><VendorCell agent={agent} navigate={navigate} /></td> : null}
      <td><PricingCell agent={agent} /></td>
      <td>{agent.access}</td><td>{agent.hosting}</td>
      <td><div className="repo-docs source-actions">{websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer" aria-label={agent.name + " website"} title="Website"><ExternalLink size={15} /><span>Website</span></a> : null}{agent.githubRepo ? <a href={"https://github.com/" + agent.githubRepo} target="_blank" rel="noreferrer" aria-label={agent.name + " repository"} title="Repository"><Code2 size={15} /><span>Repo</span></a> : null}{!websiteUrl && !agent.githubRepo ? <span className="metric-na">Unknown</span> : null}</div></td><td className={fresh.tone === "muted" ? "danger-time" : ""}><span className={"fresh-pill sync-badge " + fresh.tone}>{fresh.label}</span></td>
      <td>{typeof agent.freshnessScore === "number" ? agent.freshnessScore.toFixed(1) : <span className="metric-na">N/A</span>}</td>
      {showTrend ? <td>{agent.hasPublicRepo ? <MiniTrend value={agent.githubMetric?.trend7dPct} /> : <span className="metric-na">N/A</span>}</td> : null}
    </tr>
  );
}

function EmptyLiveState({ backendAvailable }) {
  return <section className="empty-state live-empty-state"><Code2 size={28} /><h1>No source-backed data yet</h1><p>{backendAvailable ? "Run the source sync worker to refresh records before showing agent rows." : "Start the Appurdex API and run the source sync worker before public rows are shown."}</p><div className="empty-steps"><article><Plug size={18} /><strong>Connect data sources</strong><span>Review source status</span></article><article><RefreshCw size={18} /><strong>Enable scheduled syncs</strong><span>View sync status</span></article><article><CheckCircle2 size={18} /><strong>Review and normalize</strong><span>Read data policy</span></article></div><p>No agent data is shown until sources are connected and checked by the worker.</p></section>;
}


function DirectoryPage({ agents, filters, setFilters, navigate, backendAvailable, title = "AI Directory", description = "Live tracker and index of AI coding agents with source-backed freshness.", scopeEcosystem = null }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_DIRECTORY_PAGE_SIZE);
  const normalized = filters.query.trim().toLowerCase();
  const isOverview = title === "Overview";
  const showTrendColumn = !isOverview;
  const showVendorColumn = isOverview;
  const sortOptions = useMemo(() => DIRECTORY_SORT_OPTIONS.filter((option) => showTrendColumn || option !== "Trend 7d"), [showTrendColumn]);
  const currentSortBy = sortOptions.includes(filters.sortBy) ? filters.sortBy : DEFAULT_FILTERS.sortBy;
  const scopedAgents = useMemo(() => scopeEcosystem ? agents.filter((agent) => agent.ecosystem === scopeEcosystem) : agents, [agents, scopeEcosystem]);
  const directoryAgents = useMemo(() => withCategoryRanks(scopedAgents.filter(hasDirectoryData)), [scopedAgents]);
  const rows = useMemo(() => sortRows(directoryAgents.filter((agent) => {
    const modelFlex = agent.modelSupport?.flexibility || agent.modelSupport?.modelChoice || "";
    const modelProviders = Array.isArray(agent.modelSupport?.providers) ? agent.modelSupport.providers.join(" ") : "";
    const useCases = useCasesForAgent(agent);
    const haystack = searchableTextForAgent(agent, useCases).toLowerCase();
    const publicRepoMatches = filters.publicRepo === "All" || (filters.publicRepo === "Yes" ? agent.hasPublicRepo : !agent.hasPublicRepo);
    return (!normalized || haystack.includes(normalized)) && (scopeEcosystem || filters.ecosystem === "All" || agent.ecosystem === filters.ecosystem) && (filters.category === "All" || agent.displayCategory === filters.category) && agentMatchesMonthlyBudget(agent, filters.priceBudget) && (filters.access === "All" || agent.access === filters.access) && (filters.useCase === "All" || useCases.includes(filters.useCase)) && (filters.modelFlex === "All" || modelFlex === filters.modelFlex) && publicRepoMatches;
  }), currentSortBy), [currentSortBy, directoryAgents, filters, normalized, scopeEcosystem]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageStart = rows.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, rows.length);
  const pageItems = paginationItems(safePage, totalPages);

  useEffect(() => { setPage(1); }, [filters, normalized, scopeEcosystem, directoryAgents.length]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => {
    if (filters.sortBy !== currentSortBy) setFilters((current) => ({ ...current, sortBy: currentSortBy }));
  }, [currentSortBy, filters.sortBy, setFilters]);
  const visibleSortColumns = DIRECTORY_SORT_COLUMNS.filter((column) => showTrendColumn || column.sort !== "Trend 7d");
  const headerColumns = showVendorColumn ? [...visibleSortColumns.slice(0, 2), { label: "Vendor", sort: null }, ...visibleSortColumns.slice(2)] : visibleSortColumns;
  const emptyColumnCount = headerColumns.length;
  function setSort(sortBy) {
    setFilters((current) => ({ ...current, sortBy }));
  }

  return (
    <main className="content"><div className="page-head directory-head"><div><h1>{title}</h1><p>{description} <a href="/learn">Learn more</a></p></div><div className="page-head-meta" aria-label="Directory status"><span><CheckCircle2 size={14} />{directoryAgents.length} source-backed</span><span>{rows.length} matching</span><span className={backendAvailable ? "online" : "muted"}>{backendAvailable ? "API online" : "Static fallback"}</span></div></div>
      <section className="table-card"><FilterRail agents={directoryAgents} filters={filters} setFilters={setFilters} showEcosystem={!scopeEcosystem} sortOptions={sortOptions} />
        {directoryAgents.length ? <div className="agent-table-wrap"><table className={isOverview ? "agent-table directory-table overview-directory-table" : "agent-table directory-table"}><thead><tr>{headerColumns.map((column) => column.sort ? <DirectorySortHeader key={column.sort} label={column.label} sort={column.sort} currentSort={currentSortBy} onSort={setSort} /> : <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{visibleRows.map((agent) => <AgentRow agent={agent} key={agent.slug} navigate={navigate} showTrend={showTrendColumn} showVendor={showVendorColumn} />)}{rows.length === 0 ? <tr><td colSpan={emptyColumnCount}>No source-backed listings match the selected filters.</td></tr> : null}</tbody></table></div> : <EmptyLiveState backendAvailable={backendAvailable} />}
        {directoryAgents.length ? <div className="table-pagination"><span className="pagination-summary">Showing {pageStart} to {pageEnd} of {rows.length} results</span><nav className="pagination-pages" aria-label="Directory pagination"><button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} aria-label="Previous page">&lsaquo;</button>{pageItems.map((item) => typeof item === "number" ? <button className={item === safePage ? "pagination-page active" : "pagination-page"} type="button" key={item} onClick={() => setPage(item)} aria-current={item === safePage ? "page" : undefined}>{item}</button> : <span className="pagination-ellipsis" key={item}>...</span>)}<button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} aria-label="Next page">&rsaquo;</button></nav><label className="pagination-size"><span>Rows</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{DIRECTORY_PAGE_SIZE_OPTIONS.map((size) => <option value={size} key={size}>{size}</option>)}</select></label></div> : null}
      </section></main>
  );
}

function UseCaseProductCard({ agent, navigate }) {
  const websiteUrl = websiteUrlFor(agent);
  return (
    <article className="use-case-product-card">
      <div>
        <h2>{agent.name}</h2>
        <p>{agent.description}</p>
      </div>
      <div className="use-case-product-meta">
        <span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory || agent.category}</span>
        <PricingCell agent={agent} />
      </div>
      <div className="use-case-product-actions">
        <button type="button" onClick={() => navigate(agent.publicPath || "/ai/" + agent.slug)}>View details</button>
        {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Website</a> : null}
      </div>
    </article>
  );
}

function UseCasesIndexPage({ agents, navigate }) {
  const sourceBackedAgents = useMemo(() => agents.filter(hasDirectoryData), [agents]);
  const useCases = useMemo(() => populatedUseCases(sourceBackedAgents, APPURDEX_USE_CASE_GROUP, 3), [sourceBackedAgents]);
  return (
    <main className="content"><div className="page-head directory-head"><div><h1>Use Cases</h1><p>Browse source-backed AI coding products by the job they support.</p></div><div className="page-head-meta"><span>{useCases.length} populated</span><span>{sourceBackedAgents.length} products tagged</span></div></div>
      <section className="table-card use-case-index-card">
        <div className="use-case-index-grid">
          {useCases.map((useCase) => <button type="button" className="use-case-pill-card" key={useCase.slug} onClick={() => navigate("/use-cases/" + useCase.slug)}><strong>{useCase.label}</strong><span>{useCase.description}</span><small>{useCase.count} products</small></button>)}
        </div>
      </section>
    </main>
  );
}

function UseCaseDetailPage({ agents, navigate, slug }) {
  const sourceBackedAgents = useMemo(() => agents.filter(hasDirectoryData), [agents]);
  const result = useMemo(() => productsForUseCase(sourceBackedAgents, slug, APPURDEX_USE_CASE_GROUP, 3), [sourceBackedAgents, slug]);
  if (!result.useCase) return <PlaceholderPage title="Use case not found" navigate={navigate}>This use case is not published because it is invalid, outside Appurdex coding scope, or has fewer than 3 tagged products.</PlaceholderPage>;
  const products = sortRows(result.products, "Newest");
  return (
    <main className="content"><div className="page-head directory-head"><div><h1>{result.useCase.label}</h1><p>{result.useCase.description}</p></div><div className="page-head-meta"><span>{products.length} matching products</span><span>Coding-specific</span></div></div>
      <section className="use-case-product-grid">
        {products.map((agent) => <UseCaseProductCard key={agent.slug || agent.id || agent.name} agent={agent} navigate={navigate} />)}
      </section>
    </main>
  );
}
function mergeAgentCatalog(seedAgents, apiAgents = []) {
  const apiByKey = new Map(apiAgents.map((agent) => [agent.slug || agent.id || slugify(agent.name), agent]));
  const seen = new Set();
  const merged = seedAgents.map((seeded) => {
    const key = seeded.slug || seeded.id || slugify(seeded.name);
    const current = apiByKey.get(key);
    seen.add(key);
    if (!current) return seeded;
    return {
      ...seeded,
      ...current,
      vendorId: current.vendorId || seeded.vendorId,
      vendorName: current.vendorName || seeded.vendorName,
      vendorWebsite: current.vendorWebsite || seeded.vendorWebsite,
      vendorSourceUrl: current.vendorSourceUrl || seeded.vendorSourceUrl,
      vendorSourceLabel: current.vendorSourceLabel || seeded.vendorSourceLabel,
      marketPosition: current.marketPosition || seeded.marketPosition,
      modelSupport: current.modelSupport || seeded.modelSupport,
      sourceUrls: current.sourceUrls?.length ? current.sourceUrls : seeded.sourceUrls,
    };
  });
  apiAgents.forEach((agent) => {
    const key = agent.slug || agent.id || slugify(agent.name);
    if (!seen.has(key)) merged.push(agent);
  });
  return merged;
}
function productRankValue(agent) {
  const rank = Number(agent.marketPosition?.rankPriority);
  return Number.isFinite(rank) && rank > 0 ? rank : Infinity;
}

function sortVendorProducts(agents) {
  return [...agents].sort((a, b) => productRankValue(a) - productRankValue(b) || a.name.localeCompare(b.name));
}

function VendorOverviewCell({ vendor, navigate }) {
  const logoUrl = logoForVendor(vendor);
  return (
    <button className="agent-cell agent-link vendor-overview-cell" type="button" onClick={() => navigate('/vendors/' + vendor.id)}>
      {logoUrl ? <img alt="" src={logoUrl} /> : <span className="vendor-logo vendor-logo-small"><Building2 size={18} /></span>}
      <div>
        <div className="agent-title"><span className="vendor-name-button">{vendor.displayName || vendor.name}</span></div>
      </div>
    </button>
  );
}

function VendorOverviewFilters({ vendors, filters, setFilters }) {
  const [openFilter, setOpenFilter] = useState(null);
  const categoryOptions = useMemo(() => {
    return [...new Set(vendors.flatMap((vendor) => vendor.categories || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [vendors]);
  const activeFilterCount = filters.category !== "All" ? 1 : 0;
  function setFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  function resetFilters() { setOpenFilter(null); setFilters({ category: "All" }); }
  return (
    <div className="filter-rail vendor-filter-rail">
      <FilterSelect label="Category" value={filters.category} options={categoryOptions} onChange={(value) => setFilter("category", value)} name="vendor-category" open={openFilter === "category"} onToggle={() => setOpenFilter((current) => current === "category" ? null : "category")} onClose={() => setOpenFilter(null)} />
      <button className={activeFilterCount ? "filter-button has-active-filters" : "filter-button"} type="button" onClick={resetFilters} disabled={!activeFilterCount} title={activeFilterCount ? "Clear active filters" : "No active filters"}>
        <Filter size={16} />{activeFilterCount ? `Clear ${activeFilterCount}` : "Clear"}
      </button>
    </div>
  );
}

function VendorOverviewPage({ agents, navigate, title = "Overview" }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_DIRECTORY_PAGE_SIZE);
  const [filters, setFilters] = useState({ category: "All" });
  const vendors = useMemo(() => buildVendorRows(agents), [agents]);
  const filteredVendors = useMemo(() => {
    if (filters.category === "All") return vendors;
    return vendors.filter((vendor) => vendor.categories.includes(filters.category));
  }, [vendors, filters.category]);
  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const vendorStartIndex = (safePage - 1) * pageSize;
  const visibleVendors = filteredVendors.slice(vendorStartIndex, vendorStartIndex + pageSize);
  const pageStart = filteredVendors.length ? vendorStartIndex + 1 : 0;
  const pageEnd = Math.min(vendorStartIndex + pageSize, filteredVendors.length);
  const pageItems = paginationItems(safePage, totalPages);

  useEffect(() => { setPage(1); }, [filters.category, vendors.length, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <main className="content vendor-content">
      <div className="page-head"><div><h1>{title}</h1><p>Company-level view of source-backed AI coding agent products. Open a vendor to see its tracked ecosystem.</p></div></div>
      <section className="table-card vendor-overview-card">
        {vendors.length ? <VendorOverviewFilters vendors={vendors} filters={filters} setFilters={setFilters} /> : null}
        {filteredVendors.length ? <div className="agent-table-wrap"><table className="agent-table vendor-table"><thead><tr><th>Rank #</th><th>Vendor</th><th>Tracked products</th><th>Ecosystems</th><th>Categories</th><th>Last updated</th><th>Source</th></tr></thead><tbody>{visibleVendors.map((vendor, index) => (
          <tr key={vendor.id}>
            <td><strong>{vendorStartIndex + index + 1}</strong></td>
            <td><VendorOverviewCell vendor={vendor} navigate={navigate} /></td>
            <td>{vendor.agents.length}</td>
            <td>{vendor.ecosystems.join(', ')}</td>
            <td>{vendor.categories.join(', ')}</td>
            <td>{relativeTime(vendor.latestSyncedAt)}</td>
            <td>{vendor.sourceUrl ? <a href={vendor.sourceUrl} target="_blank" rel="noreferrer">{cleanSourceLabel(vendor.sourceLabel, 'Official source')}</a> : 'N/A'}</td>
          </tr>
        ))}</tbody></table></div> : <section className="empty-state"><h1>{vendors.length ? "No vendors match this category" : "No vendor records yet"}</h1><p>{vendors.length ? "Clear the category filter to see all vendor records." : "Vendor rows appear after product records include source-backed vendor metadata."}</p></section>}
        {filteredVendors.length ? <div className="table-pagination"><span className="pagination-summary">Showing {pageStart} to {pageEnd} of {filteredVendors.length} results</span><nav className="pagination-pages" aria-label="Vendor pagination"><button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} aria-label="Previous page">&lsaquo;</button>{pageItems.map((item) => typeof item === "number" ? <button className={item === safePage ? "pagination-page active" : "pagination-page"} type="button" key={item} onClick={() => setPage(item)} aria-current={item === safePage ? "page" : undefined}>{item}</button> : <span className="pagination-ellipsis" key={item}>...</span>)}<button className="pagination-arrow" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} aria-label="Next page">&rsaquo;</button></nav><label className="pagination-size"><span>Rows</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{DIRECTORY_PAGE_SIZE_OPTIONS.map((size) => <option value={size} key={size}>{size}</option>)}</select></label></div> : null}
      </section>
    </main>
  );
}

function VendorEcosystemPage({ vendor, navigate }) {
  if (!vendor) return <main className="content"><section className="empty-state"><h1>Vendor not found</h1><button type="button" onClick={() => navigate('/')}>Back to overview</button></section></main>;
  const ecosystemRows = vendor.ecosystems.map((ecosystem) => {
    const ecosystemAgents = sortVendorProducts(vendor.agents.filter((agent) => (agent.ecosystem || 'Agents') === ecosystem));
    return { ecosystem, agents: ecosystemAgents, categories: [...new Set(ecosystemAgents.map((agent) => agent.displayCategory || agent.category).filter(Boolean))].sort() };
  });
  const vendorProducts = sortVendorProducts(vendor.agents);
  return (
    <main className="content vendor-content detail-content">
      <button className="back-button" type="button" onClick={() => navigate('/')}>Back to overview</button>
      <section className="agent-detail vendor-detail">
        <div className="agent-detail-head">{logoForVendor(vendor) ? <VendorLogo vendor={vendor} /> : <div className="vendor-logo"><Building2 size={28} /></div>}<div><h1>{vendor.displayName || vendor.name}</h1><p>Tracked ecosystem view for products already verified in the Appurdex AI coding agent directory.</p><div className="badge-row"><span className="category-pill blue">{vendorProducts.length} products</span><span className="fresh-pill fresh">{vendor.ecosystems.length} ecosystems</span></div></div><div className="detail-actions">{vendor.website ? <a href={vendor.website} target="_blank" rel="noreferrer"><ExternalLink size={16} />Website</a> : null}{vendor.sourceUrl ? <a href={vendor.sourceUrl} target="_blank" rel="noreferrer"><BookOpen size={16} />Source</a> : null}</div></div>
        <section className="vendor-ecosystem-products" aria-label={(vendor.displayName || vendor.name) + ' ecosystem products'}>
          {ecosystemRows.map((row) => <article key={row.ecosystem} className="vendor-ecosystem-section"><div className="vendor-ecosystem-section-head"><div><span>{row.ecosystem}</span><strong>{row.agents.length} products</strong></div><small>{row.categories.join(', ') || 'No categories'}</small></div><div className="vendor-product-card-grid">{row.agents.map((agent) => <button className="vendor-product-card" type="button" key={agent.id || agent.slug || agent.name} onClick={() => navigate(agent.publicPath)}><AgentLogo agent={agent} /><span>{agent.name}</span><small>{agent.displayCategory || agent.category}</small></button>)}</div></article>)}
        </section>
        <section className="table-card vendor-products-panel"><div className="analytics-panel-head"><h2>Tracked Products</h2><p>Only source-backed products already in the Appurdex directory are shown here.</p></div><div className="agent-table-wrap"><table className="agent-table vendor-product-table"><thead><tr><th>Product</th><th>Category</th><th>Pricing</th><th>Model support</th><th>Last updated</th></tr></thead><tbody>{vendorProducts.map((agent) => <tr key={agent.id || agent.slug || agent.name}><td><button className="agent-cell agent-link" type="button" onClick={() => navigate(agent.publicPath)}><AgentLogo agent={agent} /><div><div className="agent-title">{agent.name}</div><p>{agent.description}</p></div></button></td><td><span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span></td><td><PricingCell agent={agent} /></td><td>{modelSupportText(agent) || <span className="metric-na">N/A</span>}</td><td><span className={"fresh-pill sync-badge " + (agent.syncAgeTone || "unknown")}>Last updated {agent.syncAgeLabel || "not synced"}</span></td></tr>)}</tbody></table></div></section>
      </section>
    </main>
  );
}

function compareEdgeLabels(items, getEdge) {
  if (!getEdge || items.length < 2) return [];
  const edges = items.map((item) => {
    const edge = getEdge(item);
    if (!edge || typeof edge.score !== "number" || !Number.isFinite(edge.score)) return null;
    return { score: edge.score, label: edge.label || "edge" };
  });
  const scores = edges.filter(Boolean).map((edge) => edge.score);
  if (scores.length < 2) return [];
  const best = Math.max(...scores);
  const worst = Math.min(...scores);
  if (best === worst) return [];
  return edges.map((edge) => edge && edge.score === best ? edge.label : null);
}

function CompareMetricValue({ value, edgeLabel }) {
  return (
    <div className={edgeLabel ? "compare-metric-value has-edge" : "compare-metric-value"}>
      <div className="compare-primary-value">{value}</div>
      {edgeLabel ? <span className="compare-edge-pill"><CheckCircle2 size={13} />Edge: {edgeLabel}</span> : null}
    </div>
  );
}

function CompareMetricRow({ label, agents, getValue, getEdge }) {
  const edgeLabels = compareEdgeLabels(agents, getEdge);
  return <tr><th>{label}</th>{agents.map((agent, index) => <td key={(agent.slug || agent.id || agent.name) + "-metric-" + index}><CompareMetricValue value={getValue(agent)} edgeLabel={edgeLabels[index]} /></td>)}</tr>;
}

function pricingEdge(agent) {
  const parts = pricingSortParts(agent);
  if (!parts || parts.typeRank >= 4) return null;
  const amount = Number.isFinite(parts.amount) ? Math.min(parts.amount, 999999) : 999999;
  return { score: -(parts.typeRank * 1000000 + amount), label: parts.typeRank === 0 ? "free entry" : "lower entry" };
}

function accessEdge(agent) {
  const access = String(agent.access || "").toLowerCase();
  if (!access || access === "unknown") return null;
  if (access.includes("open")) return { score: 3, label: "more open" };
  if (agent.hasPublicRepo || agent.githubRepo) return { score: 2, label: "public repo" };
  return { score: 1, label: "listed access" };
}

function hostingEdge(agent) {
  const hosting = String(agent.hosting || "").toLowerCase();
  if (!hosting || hosting === "unknown") return null;
  if (hosting.includes("hybrid") || hosting.includes("multi")) return { score: 4, label: "flexible hosting" };
  if (hosting.includes("self")) return { score: 3, label: "self-host control" };
  if (hosting.includes("local") || hosting.includes("on-prem")) return { score: 3, label: "local control" };
  if (hosting.includes("cloud") || hosting.includes("hosted")) return { score: 2, label: "managed hosting" };
  return { score: 1, label: "known hosting" };
}

function dateEdge(value, label = "most recent") {
  const score = dateValue(value);
  return score ? { score, label } : null;
}

function numericEdge(value, label) {
  const score = parseNumberLike(value);
  return score !== null ? { score, label } : null;
}

function releaseCadenceEdge(agent) {
  const days = parseNumberLike(agent.githubMetric?.releaseCadenceDays);
  return days && days > 0 ? { score: -days, label: "faster releases" } : null;
}

function sharedUseCases(agentA, agentB) {
  const left = new Set(useCasesForAgent(agentA));
  return useCasesForAgent(agentB).filter((useCase) => left.has(useCase));
}

function productCompareCompatible(agentA, agentB) {
  if (!agentA || !agentB) return true;
  const leftCategory = agentA.displayCategory || agentA.category || "";
  const rightCategory = agentB.displayCategory || agentB.category || "";
  return Boolean(leftCategory && rightCategory && leftCategory === rightCategory) || sharedUseCases(agentA, agentB).length > 0;
}

function defaultCompareIds(items, getId) {
  return items.map(getId).filter(Boolean).slice(0, 2);
}

function defaultProductCompareSlugs(agents, initialSlugs = []) {
  const available = new Set(agents.map((agent) => agent.slug).filter(Boolean));
  const seeded = [];
  initialSlugs.forEach((slug) => {
    if (available.has(slug) && !seeded.includes(slug)) seeded.push(slug);
  });
  const anchor = agents.find((agent) => agent.slug === seeded[0]) || agents[0] || null;
  if (!anchor) return seeded.slice(0, 5);
  const next = (seeded.length ? seeded : [anchor.slug]).filter((slug) => {
    const agent = agents.find((candidate) => candidate.slug === slug);
    return agent && productCompareCompatible(anchor, agent);
  });
  if (!next.includes(anchor.slug)) next.unshift(anchor.slug);
  agents.forEach((agent) => {
    if (next.length >= 2 || !agent.slug || next.includes(agent.slug)) return;
    if (productCompareCompatible(anchor, agent)) next.push(agent.slug);
  });
  return next.slice(0, 5);
}
function compatibilityText(anchorAgent) {
  if (!anchorAgent) return "Pick the first product, then only similar category or use-case products are available.";
  const useCases = useCasesForAgent(anchorAgent);
  return "Matching against " + anchorAgent.name + " by " + (anchorAgent.displayCategory || anchorAgent.category || "category") + (useCases.length ? " / " + useCases.join(", ") : "") + ".";
}

function CompareAgentPicker({ label, value, agents, onChange, onRemove, removable }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedAgent = agents.find((agent) => agent.slug === value) || null;
  const normalized = query.trim().toLowerCase();
  const visibleAgents = useMemo(() => {
    const haystackFor = (agent) => searchableTextForAgent(agent).toLowerCase();
    return agents.filter((agent) => !normalized || haystackFor(agent).includes(normalized));
  }, [agents, normalized]);

  function choose(agent) {
    onChange(agent.slug);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="compare-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="compare-picker-label">
        <span>{label}</span>
        {removable ? <button type="button" onClick={onRemove}>Remove</button> : null}
      </div>
      {selectedAgent ? (
        <button className="compare-selected-agent" type="button" onClick={() => setOpen(true)}>
          <AgentLogo agent={selectedAgent} />
          <span>
            <strong>{selectedAgent.name}</strong>
            <small>{selectedAgent.ecosystem} / {selectedAgent.displayCategory}</small>
          </span>
          <span className={"category-pill " + (categoryClass[selectedAgent.category] || "blue")}>{selectedAgent.displayCategory}</span>
        </button>
      ) : null}
      <label className="compare-search-field">
        <Search size={15} />
        <input
          value={query}
          placeholder={selectedAgent ? "Search to replace agent..." : "Search agents..."}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </label>
      {open ? (
        <div className="compare-agent-results" role="listbox" aria-label={label + " agent search results"}>
          {visibleAgents.length ? visibleAgents.map((agent) => {
            const selected = agent.slug === value;
            return (
              <button className={selected ? "selected" : ""} type="button" role="option" aria-selected={selected} key={agent.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(agent)}>
                <AgentLogo agent={agent} />
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.ecosystem} / {agent.displayCategory}</small>
                </span>
                <span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span>
              </button>
            );
          }) : <p>No matching agents.</p>}
        </div>
      ) : null}
    </div>
  );
}
function CompareVendorPicker({ label, value, vendors, onChange, onRemove, removable }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedVendor = vendors.find((vendor) => vendor.id === value) || null;
  const normalized = query.trim().toLowerCase();
  const visibleVendors = useMemo(() => {
    const haystackFor = (vendor) => [vendor.name, vendor.displayName, vendor.ecosystems?.join(" "), vendor.categories?.join(" "), vendor.agents?.map((agent) => agent.name).join(" ")].filter(Boolean).join(" ").toLowerCase();
    return vendors.filter((vendor) => !normalized || haystackFor(vendor).includes(normalized));
  }, [vendors, normalized]);

  function choose(vendor) {
    onChange(vendor.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="compare-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="compare-picker-label">
        <span>{label}</span>
        {removable ? <button type="button" onClick={onRemove}>Remove</button> : null}
      </div>
      {selectedVendor ? (
        <button className="compare-selected-agent" type="button" onClick={() => setOpen(true)}>
          <VendorLogo vendor={selectedVendor} />
          <span>
            <strong>{selectedVendor.displayName || selectedVendor.name}</strong>
            <small>{selectedVendor.agents.length} products / {selectedVendor.ecosystems.join(", ")}</small>
          </span>
          <span className="category-pill blue">{selectedVendor.categories.length} categories</span>
        </button>
      ) : null}
      <label className="compare-search-field">
        <Search size={15} />
        <input
          value={query}
          placeholder={selectedVendor ? "Search to replace vendor..." : "Search vendors..."}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </label>
      {open ? (
        <div className="compare-agent-results" role="listbox" aria-label={label + " vendor search results"}>
          {visibleVendors.length ? visibleVendors.map((vendor) => {
            const selected = vendor.id === value;
            return (
              <button className={selected ? "selected" : ""} type="button" role="option" aria-selected={selected} key={vendor.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(vendor)}>
                <VendorLogo vendor={vendor} />
                <span>
                  <strong>{vendor.displayName || vendor.name}</strong>
                  <small>{vendor.agents.length} products / {vendor.ecosystems.join(", ")}</small>
                </span>
                <span className="category-pill blue">{vendor.categories.length} categories</span>
              </button>
            );
          }) : <p>No matching vendors.</p>}
        </div>
      ) : null}
    </div>
  );
}

function CompareVendorMetricRow({ label, vendors, getValue, getEdge }) {
  const edgeLabels = compareEdgeLabels(vendors, getEdge);
  return <tr><th>{label}</th>{vendors.map((vendor, index) => <td key={(vendor.id || vendor.name) + "-vendor-metric-" + index}><CompareMetricValue value={getValue(vendor)} edgeLabel={edgeLabels[index]} /></td>)}</tr>;
}

function modelSearchText(model) {
  return [model.provider, model.model, model.modelId, model.modelFamily, model.status, model.sourceLabel].filter(Boolean).join(" ").toLowerCase();
}

function standardModelPlan(model) {
  return model?.pricingPlans?.find((plan) => plan.id === "standard") || model?.pricingPlans?.[0] || null;
}

function modelPriceValue(model, keys) {
  const prices = standardModelPlan(model)?.pricesUsdPerMillion || model?.tokenPricesUsdPerMillion || {};
  for (const key of keys) {
    const value = prices[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function modelPriceLabel(model, keys) {
  const value = modelPriceValue(model, keys);
  return value === null ? "--" : "$" + new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(value) + " / 1M";
}

function modelPriceEdge(keys) {
  return (model) => {
    const value = modelPriceValue(model, keys);
    return value === null ? null : { score: -value, label: "lower price" };
  };
}

function modelPlanAvailability(model, planId) {
  return model?.pricingPlans?.some((plan) => plan.id === planId) ? "Available" : "--";
}

function modelEffectiveWindow(model) {
  if (model.effectiveFrom && model.effectiveUntil) return model.effectiveFrom + " to " + model.effectiveUntil;
  if (model.effectiveFrom) return "From " + model.effectiveFrom;
  if (model.effectiveUntil) return "Until " + model.effectiveUntil;
  return "Current";
}

function CompareModelPicker({ label, value, models, onChange, onRemove, removable }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedModel = models.find((model) => model.id === value) || null;
  const normalized = query.trim().toLowerCase();
  const visibleModels = useMemo(() => models.filter((model) => !normalized || modelSearchText(model).includes(normalized)), [models, normalized]);

  function choose(model) {
    onChange(model.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="compare-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="compare-picker-label">
        <span>{label}</span>
        {removable ? <button type="button" onClick={onRemove}>Remove</button> : null}
      </div>
      {selectedModel ? (
        <button className="compare-selected-agent compare-selected-model" type="button" onClick={() => setOpen(true)}>
          <ModelLogo model={selectedModel} />
          <span>
            <strong>{selectedModel.model}</strong>
            <small>{selectedModel.provider} / {selectedModel.modelFamily}</small>
          </span>
          <span className="category-pill blue">{selectedModel.status || "current"}</span>
        </button>
      ) : null}
      <label className="compare-search-field">
        <Search size={15} />
        <input
          value={query}
          placeholder={selectedModel ? "Search to replace model..." : "Search models..."}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </label>
      {open ? (
        <div className="compare-agent-results compare-model-results" role="listbox" aria-label={label + " model search results"}>
          {visibleModels.length ? visibleModels.map((model) => {
            const selected = model.id === value;
            return (
              <button className={selected ? "selected" : ""} type="button" role="option" aria-selected={selected} key={model.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(model)}>
                <ModelLogo model={model} />
                <span>
                  <strong>{model.model}</strong>
                  <small>{model.provider} / {model.modelFamily}</small>
                </span>
                <span className="category-pill blue">{model.status || "current"}</span>
              </button>
            );
          }) : <p>No matching models.</p>}
        </div>
      ) : null}
    </div>
  );
}
function ComparePage({ agents, navigate, viewer, snapshots = [], initialSlugs = [], modelPricing = [] }) {
  const compareableAgents = useMemo(() => sortRows(withCategoryRanks(agents), "Popularity"), [agents]);
  const compareableVendors = useMemo(() => buildVendorRows(agents), [agents]);
  const compareableModels = useMemo(() => [...(modelPricing || [])].sort((a, b) => compareText(a.provider, b.provider) || compareText(a.model, b.model)), [modelPricing]);
  const [compareMode, setCompareMode] = useState("products");
  const [draftSlugs, setDraftSlugs] = useState([]);
  const [draftVendorIds, setDraftVendorIds] = useState([]);
  const [draftModelIds, setDraftModelIds] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [vendorsInitialized, setVendorsInitialized] = useState(false);
  const [modelsInitialized, setModelsInitialized] = useState(false);
  const compareSlotLimit = viewer?.access?.compareProductsUnlimited ? 5 : Number(viewer?.limits?.compareLimit || 2);
  const compareSlotLimitLabel = compareSlotLimit >= 5 ? "5 selections" : compareSlotLimit + " selections";

  useEffect(() => {
    if (initialized || !compareableAgents.length) return;
    setDraftSlugs(defaultProductCompareSlugs(compareableAgents, initialSlugs));
    setInitialized(true);
  }, [compareableAgents, initialSlugs, initialized]);
  useEffect(() => {
    if (vendorsInitialized || !compareableVendors.length) return;
    setDraftVendorIds(defaultCompareIds(compareableVendors, (vendor) => vendor.id));
    setVendorsInitialized(true);
  }, [compareableVendors, vendorsInitialized]);

  useEffect(() => {
    if (modelsInitialized || !compareableModels.length) return;
    setDraftModelIds(defaultCompareIds(compareableModels, (model) => model.id));
    setModelsInitialized(true);
  }, [compareableModels, modelsInitialized]);

  function uniqueCompareSlugs(values) {
    const seen = new Set();
    const next = [];
    values.slice(0, compareSlotLimit).forEach((slug) => {
      if (!slug) {
        next.push("");
        return;
      }
      if (!seen.has(slug)) {
        seen.add(slug);
        next.push(slug);
      }
    });
    return next.slice(0, compareSlotLimit);
  }

  function uniqueCompareVendorIds(values) {
    const seen = new Set();
    const next = [];
    values.slice(0, compareSlotLimit).forEach((vendorId) => {
      if (!vendorId) {
        next.push("");
        return;
      }
      if (!seen.has(vendorId)) {
        seen.add(vendorId);
        next.push(vendorId);
      }
    });
    return next.slice(0, compareSlotLimit);
  }

  function uniqueCompareModelIds(values) {
    const seen = new Set();
    const next = [];
    values.slice(0, compareSlotLimit).forEach((modelId) => {
      if (!modelId) {
        next.push("");
        return;
      }
      if (!seen.has(modelId)) {
        seen.add(modelId);
        next.push(modelId);
      }
    });
    return next.slice(0, compareSlotLimit);
  }

  function compatibleSlugs(values) {
    const uniqueSlugs = uniqueCompareSlugs(values);
    const anchor = compareableAgents.find((agent) => agent.slug === uniqueSlugs.find(Boolean));
    if (!anchor) return uniqueSlugs;
    return uniqueSlugs.filter((slug) => {
      if (!slug) return true;
      const agent = compareableAgents.find((candidate) => candidate.slug === slug);
      return agent && productCompareCompatible(anchor, agent);
    });
  }

  function setSlot(index, slug) {
    const next = [...draftSlugs];
    next[index] = slug;
    setDraftSlugs(compatibleSlugs(next));
  }

  function setVendorSlot(index, vendorId) {
    const next = [...draftVendorIds];
    next[index] = vendorId;
    setDraftVendorIds(uniqueCompareVendorIds(next));
  }

  function setModelSlot(index, modelId) {
    const next = [...draftModelIds];
    next[index] = modelId;
    setDraftModelIds(uniqueCompareModelIds(next));
  }

  function addSlot() {
    const currentSlots = draftSlugs.length ? draftSlugs : ["", ""];
    if (currentSlots.length < compareSlotLimit) setDraftSlugs(uniqueCompareSlugs([...currentSlots, ""]));
  }

  function addVendorSlot() {
    const currentSlots = draftVendorIds.length ? draftVendorIds : ["", ""];
    if (currentSlots.length < compareSlotLimit) setDraftVendorIds(uniqueCompareVendorIds([...currentSlots, ""]));
  }

  function addModelSlot() {
    const currentSlots = draftModelIds.length ? draftModelIds : ["", ""];
    if (currentSlots.length < compareSlotLimit) setDraftModelIds(uniqueCompareModelIds([...currentSlots, ""]));
  }

  function removeSlot(index) {
    setDraftSlugs(draftSlugs.filter((_, itemIndex) => itemIndex !== index));
  }

  function removeVendorSlot(index) {
    setDraftVendorIds(draftVendorIds.filter((_, itemIndex) => itemIndex !== index));
  }

  function removeModelSlot(index) {
    setDraftModelIds(draftModelIds.filter((_, itemIndex) => itemIndex !== index));
  }

  const slots = draftSlugs.length ? draftSlugs : ["", ""];
  const vendorSlots = draftVendorIds.length ? draftVendorIds : ["", ""];
  const modelSlots = draftModelIds.length ? draftModelIds : ["", ""];
  const selectedAgents = draftSlugs.map((slug) => compareableAgents.find((agent) => agent.slug === slug)).filter(Boolean);
  const selectedVendors = draftVendorIds.map((vendorId) => compareableVendors.find((vendor) => vendor.id === vendorId)).filter(Boolean);
  const selectedModels = draftModelIds.map((modelId) => compareableModels.find((model) => model.id === modelId)).filter(Boolean);
  const anchorAgent = selectedAgents[0] || null;
  const availableProductOptions = anchorAgent ? compareableAgents.filter((agent) => agent.slug === anchorAgent.slug || productCompareCompatible(anchorAgent, agent)) : compareableAgents;
  const activeAdd = compareMode === "vendors" ? addVendorSlot : compareMode === "models" ? addModelSlot : addSlot;
  const canAddProduct = slots.length < compareSlotLimit && compareableAgents.some((agent) => !draftSlugs.includes(agent.slug) && (!anchorAgent || productCompareCompatible(anchorAgent, agent)));
  const canAddVendor = vendorSlots.length < compareSlotLimit && compareableVendors.some((vendor) => !draftVendorIds.includes(vendor.id));
  const canAddModel = modelSlots.length < compareSlotLimit && compareableModels.some((model) => !draftModelIds.includes(model.id));
  const activeCanAdd = compareMode === "vendors" ? canAddVendor : compareMode === "models" ? canAddModel : canAddProduct;
  const activeLabel = compareMode === "vendors" ? "vendor" : compareMode === "models" ? "model" : "product";
  const selectedCountLabel = compareMode === "vendors" ? selectedVendors.length + " vendors selected" : compareMode === "models" ? selectedModels.length + " models selected" : selectedAgents.length + " products selected";
  const compareNote = compareMode === "vendors" ? "Search vendors by company, ecosystem, category, or tracked product. Vendor comparisons use only visible product records." : compareMode === "models" ? "Search source-backed model pricing rows by provider, family, model name, or status." : compatibilityText(anchorAgent);

  return (
    <main className="content">
      <div className="page-head"><div><h1>Compare</h1><p>Side-by-side source-backed metrics for vendors, compatible products, or model pricing already tracked in Appurdex.</p></div></div>
      <section className="table-card compare-builder">
        <div className="compare-mode-tabs" aria-label="Compare mode">
          <button className={compareMode === "products" ? "active" : ""} type="button" onClick={() => setCompareMode("products")}>Products</button>
          <button className={compareMode === "vendors" ? "active" : ""} type="button" onClick={() => setCompareMode("vendors")}>Vendors</button>
          <button className={compareMode === "models" ? "active" : ""} type="button" onClick={() => setCompareMode("models")}>Models</button>
        </div>
        <div className="compare-builder-head">
          {compareMode === "vendors" ? vendorSlots.map((vendorId, index) => (
            <CompareVendorPicker key={"vendor-compare-slot-" + index} label={"Vendor " + (index + 1)} value={vendorId} vendors={compareableVendors} onChange={(nextVendorId) => setVendorSlot(index, nextVendorId)} onRemove={() => removeVendorSlot(index)} removable={draftVendorIds.length > 0 && vendorSlots.length > 1} />
          )) : compareMode === "models" ? modelSlots.map((modelId, index) => (
            <CompareModelPicker key={"model-compare-slot-" + index} label={"Model " + (index + 1)} value={modelId} models={compareableModels} onChange={(nextModelId) => setModelSlot(index, nextModelId)} onRemove={() => removeModelSlot(index)} removable={draftModelIds.length > 0 && modelSlots.length > 1} />
          )) : slots.map((slug, index) => (
            <CompareAgentPicker key={"compare-slot-" + index} label={"Product " + (index + 1)} value={slug} agents={index === 0 ? compareableAgents : availableProductOptions} onChange={(nextSlug) => setSlot(index, nextSlug)} onRemove={() => removeSlot(index)} removable={draftSlugs.length > 0 && slots.length > 1} />
          ))}
        </div>
        <div className="compare-builder-actions">
          <button type="button" onClick={activeAdd} disabled={!activeCanAdd}><Plus size={15} />Add {activeLabel}</button>
          <span>{selectedCountLabel}</span>
        </div>
        <p className="compare-note">{compareNote}</p>
        <p className="compare-note compare-limit-note">Current plan allows {compareSlotLimitLabel}. Upgrade for larger 3-5 item comparisons.</p>
      </section>
      {compareMode === "vendors" && selectedVendors.length ? <section className="table-card compare-card"><div className="agent-table-wrap"><table className="agent-table compare-table"><thead><tr><th>Field</th>{selectedVendors.map((vendor, index) => <th key={(vendor.id || vendor.name) + "-vendor-compare-head-" + index}><button className="agent-cell agent-link" type="button" onClick={() => navigate("/vendors/" + vendor.id)}><VendorLogo vendor={vendor} /><div><div className="agent-title">{vendor.displayName || vendor.name}</div><p>{vendor.agents.length} products / {vendor.ecosystems.join(", ")}</p></div></button></th>)}</tr></thead><tbody>
        <CompareVendorMetricRow label="Tracked products" vendors={selectedVendors} getValue={(vendor) => vendor.agents.length} getEdge={(vendor) => ({ score: vendor.agents.length, label: "more tracked" })} />
        <CompareVendorMetricRow label="Ecosystems" vendors={selectedVendors} getValue={(vendor) => vendor.ecosystems.join(", ") || "--"} getEdge={(vendor) => ({ score: vendor.ecosystems.length, label: "wider coverage" })} />
        <CompareVendorMetricRow label="Categories" vendors={selectedVendors} getValue={(vendor) => vendor.categories.join(", ") || "--"} getEdge={(vendor) => ({ score: vendor.categories.length, label: "wider coverage" })} />
        <CompareVendorMetricRow label="Products" vendors={selectedVendors} getValue={(vendor) => sortVendorProducts(vendor.agents).map((agent) => agent.name).join(", ") || "--"} />
        <CompareVendorMetricRow label="Last synced" vendors={selectedVendors} getValue={(vendor) => relativeTime(vendor.latestSyncedAt)} getEdge={(vendor) => dateEdge(vendor.latestSyncedAt)} />
        <CompareVendorMetricRow label="Website" vendors={selectedVendors} getValue={(vendor) => vendor.website ? <a className="inline-link" href={vendor.website} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open</a> : "--"} />
        <CompareVendorMetricRow label="Source" vendors={selectedVendors} getValue={(vendor) => vendor.sourceUrl ? <a className="inline-link" href={vendor.sourceUrl} target="_blank" rel="noreferrer"><BookOpen size={15} />{cleanSourceLabel(vendor.sourceLabel, "Source")}</a> : "--"} />
      </tbody></table></div></section> : compareMode === "models" && selectedModels.length ? <section className="table-card compare-card"><div className="agent-table-wrap"><table className="agent-table compare-table model-compare-table"><thead><tr><th>Field</th>{selectedModels.map((model, index) => <th key={model.id + "-model-compare-head-" + index}><div className="agent-cell model-compare-head"><ModelLogo model={model} /><div><div className="agent-title">{model.model}</div><p>{model.provider} / {model.modelFamily}</p></div></div></th>)}</tr></thead><tbody>
        <CompareMetricRow label="Provider" agents={selectedModels} getValue={(model) => model.provider || "--"} />
        <CompareMetricRow label="Model family" agents={selectedModels} getValue={(model) => model.modelFamily || "--"} />
        <CompareMetricRow label="Status" agents={selectedModels} getValue={(model) => <span className="fresh-pill muted">{model.status || "current"}</span>} />
        <CompareMetricRow label="Availability" agents={selectedModels} getValue={(model) => model.availabilityNote || "General API pricing"} />
        <CompareMetricRow label="Input" agents={selectedModels} getValue={(model) => modelPriceLabel(model, ["input", "inputTextImageVideo"])} getEdge={modelPriceEdge(["input", "inputTextImageVideo"])} />
        <CompareMetricRow label="Cached/context input" agents={selectedModels} getValue={(model) => modelPriceLabel(model, ["cachedInput", "cacheHit", "contextCache", "contextCacheTextImageVideo"])} getEdge={modelPriceEdge(["cachedInput", "cacheHit", "contextCache", "contextCacheTextImageVideo"])} />
        <CompareMetricRow label="Output" agents={selectedModels} getValue={(model) => modelPriceLabel(model, ["output"])} getEdge={modelPriceEdge(["output"])} />
        <CompareMetricRow label="Batch" agents={selectedModels} getValue={(model) => modelPlanAvailability(model, "batch")} />
        <CompareMetricRow label="Flex" agents={selectedModels} getValue={(model) => modelPlanAvailability(model, "flex")} />
        <CompareMetricRow label="Priority" agents={selectedModels} getValue={(model) => modelPlanAvailability(model, "priority")} />
        <CompareMetricRow label="Effective" agents={selectedModels} getValue={modelEffectiveWindow} />
        <CompareMetricRow label="Source" agents={selectedModels} getValue={(model) => model.sourceUrl ? <a className="inline-link" href={model.sourceUrl} target="_blank" rel="noreferrer"><BookOpen size={15} />{cleanSourceLabel(model.sourceLabel, "Source")}</a> : "--"} />
      </tbody></table></div></section> : compareMode === "products" && selectedAgents.length ? <section className="table-card compare-card"><div className="agent-table-wrap"><table className="agent-table compare-table"><thead><tr><th>Field</th>{selectedAgents.map((agent, index) => <th key={(agent.slug || agent.id || agent.name) + "-compare-head-" + index}><button className="agent-cell agent-link" type="button" onClick={() => navigate(agent.publicPath)}><AgentLogo agent={agent} /><div><div className="agent-title">{agent.name}</div><p>{agent.ecosystem} / {agent.displayCategory}</p></div></button></th>)}</tr></thead><tbody>
        <CompareMetricRow label="Vendor" agents={selectedAgents} getValue={(agent) => { const vendor = vendorForAgent(agent); return vendor ? <button className="inline-link as-button" type="button" onClick={() => navigate("/vendors/" + vendor.id)}><Building2 size={15} />{vendor.displayName || vendor.name}</button> : "--"; }} />
        <CompareMetricRow label="Ecosystem" agents={selectedAgents} getValue={(agent) => agent.ecosystem || "--"} />
        <CompareMetricRow label="Category" agents={selectedAgents} getValue={(agent) => <span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span>} />
        <CompareMetricRow label="Use cases" agents={selectedAgents} getValue={(agent) => useCasesForAgent(agent).join(", ") || "--"} />
        <CompareMetricRow label="Pricing" agents={selectedAgents} getValue={(agent) => agent.price} getEdge={pricingEdge} />
        <CompareMetricRow label="Access" agents={selectedAgents} getValue={(agent) => agent.access} getEdge={accessEdge} />
        <CompareMetricRow label="Hosting" agents={selectedAgents} getValue={(agent) => agent.hosting} getEdge={hostingEdge} />
        <CompareMetricRow label="Last synced" agents={selectedAgents} getValue={(agent) => agent.syncAgeLabel || "Not synced"} getEdge={(agent) => dateEdge(agent.lastSyncedAt || agent.last_synced_at)} />
        <CompareMetricRow label="Freshness" agents={selectedAgents} getValue={(agent) => <span className={"fresh-pill sync-badge " + (agent.syncAgeTone || "unknown")}>Last updated {agent.syncAgeLabel || "not synced"}</span>} getEdge={(agent) => ({ score: numberValue(agent.freshnessScore ?? agent.freshness_score, 0), label: "freshest" })} />
        <CompareMetricRow label="Package downloads" agents={selectedAgents} getValue={(agent) => agent.adoptionMetrics?.packageDownloadsMonthly || agent.adoptionMetrics?.packageDownloadVelocity || "--"} getEdge={(agent) => numericEdge(agent.adoptionMetrics?.packageDownloadsMonthly || agent.adoptionMetrics?.packageDownloadVelocity, "higher usage")} />
        <CompareMetricRow label="Stars" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? formatNumber(agent.githubMetric?.stars) : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? numericEdge(agent.githubMetric?.stars, "more stars") : null} />
        <CompareMetricRow label="Forks" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? formatNumber(agent.githubMetric?.forks) : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? numericEdge(agent.githubMetric?.forks, "more forks") : null} />
        <CompareMetricRow label="Contributors" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? formatNumber(agent.githubMetric?.contributorCount) : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? numericEdge(agent.githubMetric?.contributorCount, "more contributors") : null} />
        <CompareMetricRow label="Commits 30d" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? formatNumber(agent.githubMetric?.commitCount30d) : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? numericEdge(agent.githubMetric?.commitCount30d, "more activity") : null} />
        <CompareMetricRow label="Release cadence" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? (agent.githubMetric?.releaseCadenceDays ? agent.githubMetric.releaseCadenceDays + "d" : "--") : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? releaseCadenceEdge(agent) : null} />
        <CompareMetricRow label="Trend 7d" agents={selectedAgents} getValue={(agent) => agent.hasPublicRepo ? <MiniTrend value={agent.githubMetric?.trend7dPct} /> : <span className="metric-na">N/A</span>} getEdge={(agent) => agent.hasPublicRepo ? numericEdge(agent.githubMetric?.trend7dPct, "stronger trend") : null} />
        <CompareMetricRow label="Website" agents={selectedAgents} getValue={(agent) => websiteUrlFor(agent) ? <a className="inline-link" href={websiteUrlFor(agent)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open</a> : "--"} />
      </tbody></table></div></section> : <section className="empty-state"><h1>No comparison selected</h1><p>Choose {compareMode === "vendors" ? "vendors" : compareMode === "models" ? "models" : "compatible products"} above to compare available metrics.</p><button type="button" onClick={activeAdd} disabled={!activeCanAdd}><Plus size={15} />Add {activeLabel}</button></section>}
    </main>
  );
}

function pct(part, total) {
  if (!total) return "0%";
  return Math.round((part / total) * 100) + "%";
}

function performanceMetric(agent, metric) {
  if (!agent.hasPublicRepo && ["stars", "forks", "trend", "commits"].includes(metric)) return <span className="metric-na">N/A</span>;
  if (metric === "stars") return formatNumber(agent.githubMetric?.stars);
  if (metric === "forks") return formatNumber(agent.githubMetric?.forks);
  if (metric === "commits") return formatNumber(agent.githubMetric?.commitCount30d);
  if (metric === "trend") return typeof agent.githubMetric?.trend7dPct === "number" ? (agent.githubMetric.trend7dPct >= 0 ? "+" : "") + agent.githubMetric.trend7dPct + "%" : "--";
  return "--";
}

function snapshotActivityRows(snapshots) {
  const grouped = snapshots.reduce((map, snapshot) => {
    const time = new Date(snapshot.checkedAt).getTime();
    if (!Number.isFinite(time)) return map;
    const day = new Date(time).toISOString().slice(0, 10);
    const current = map.get(day) || { day, count: 0 };
    current.count += 1;
    map.set(day, current);
    return map;
  }, new Map());
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-10);
}

function shortDateLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function EmptyChart({ children }) {
  return <div className="analytics-empty-chart">{children}</div>;
}

function CategoryCoverageChart({ rows }) {
  if (!rows.length) return <EmptyChart>No categories have source-backed agent data yet.</EmptyChart>;
  return (
    <div className="analytics-coverage-chart" aria-label="Category coverage by repository availability">
      {rows.map((row) => {
        const publicPct = row.agents ? (row.publicRepos / row.agents) * 100 : 0;
        return (
          <div className="analytics-coverage-row" key={row.category}>
            <div><strong>{row.category}</strong><small>{row.agents} agents / avg score {row.avgScore}</small></div>
            <div className="analytics-coverage-track">
              <span className="analytics-coverage-public" style={{ "--coverage-width": clamp(publicPct) + "%" }} />
            </div>
            <span>{row.publicRepos}/{row.agents} repo</span>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotActivityChart({ rows }) {
  if (!rows.length) return <EmptyChart>No metric snapshots are stored yet.</EmptyChart>;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="analytics-snapshot-chart" aria-label="Metric snapshot activity by day">
      {rows.map((row) => (
        <div className="analytics-snapshot-bar" key={row.day}>
          <span className="analytics-snapshot-fill" style={{ "--bar-height": Math.max(8, (row.count / maxCount) * 100) + "%" }} title={row.count + " snapshots on " + row.day} />
          <strong>{row.count}</strong>
          <small>{shortDateLabel(row.day)}</small>
        </div>
      ))}
    </div>
  );
}

function AgentPerformanceAnalyticsPage({ agents, state, backendAvailable, navigate }) {
  const sourceBackedAgents = withCategoryRanks(agents.filter(hasDirectoryData));
  const snapshots = state.metricSnapshots || [];
  const workerRuns = state.workerRuns || [];
  const latestRun = workerRuns[0] || null;
  const publicRepoAgents = sourceBackedAgents.filter((agent) => agent.hasPublicRepo);
  const closedSourceAgents = sourceBackedAgents.filter((agent) => !agent.hasPublicRepo);
  const githubMetricAgents = sourceBackedAgents.filter((agent) => agent.githubMetric?.ok);
  const rankedAgents = sortRows(sourceBackedAgents, "Popularity").slice(0, 20);
  const categoryRows = [...sourceBackedAgents.reduce((map, agent) => {
    const key = agent.displayCategory || agent.category || "Uncategorized";
    const current = map.get(key) || { category: key, agents: 0, publicRepos: 0, closedSource: 0, scoreTotal: 0, confidenceTotal: 0 };
    current.agents += 1;
    current.publicRepos += agent.hasPublicRepo ? 1 : 0;
    current.closedSource += agent.hasPublicRepo ? 0 : 1;
    current.scoreTotal += agent.ranking?.score || rankingScore(agent).score;
    current.confidenceTotal += agent.ranking?.confidence || rankingScore(agent).confidence;
    map.set(key, current);
    return map;
  }, new Map()).values()].map((row) => ({ ...row, avgScore: Math.round(row.scoreTotal / row.agents), avgConfidence: Math.round(row.confidenceTotal / row.agents) })).sort((a, b) => b.avgScore - a.avgScore || b.agents - a.agents);
  const snapshotRows = snapshotActivityRows(snapshots);

  return (
    <main className="content analytics-content">
      <div className="page-head"><div><h1>Agent Performance Analytics</h1><p>Public performance view built from source-backed Appurdex signals, not fabricated benchmarks.</p></div></div>
      <section className="analytics-kpis">
        <article><span>Ranked agents</span><strong>{sourceBackedAgents.length}</strong><small>{closedSourceAgents.length} closed-source tools included</small></article>
        <article><span>Public repo coverage</span><strong>{pct(publicRepoAgents.length, sourceBackedAgents.length)}</strong><small>{publicRepoAgents.length} agents have public repositories</small></article>
        <article><span>GitHub metric coverage</span><strong>{pct(githubMetricAgents.length, publicRepoAgents.length)}</strong><small>{githubMetricAgents.length} agents with repo metric snapshots</small></article>
        <article><span>Last sync</span><strong>{latestRun?.finishedAt ? relativeTime(latestRun.finishedAt) : "Not synced"}</strong><small>{latestRun?.results?.length || latestRun?.checked || 0} agents checked</small></article>
      </section>
      <section className="analytics-chart-grid">
        <article className="table-card analytics-panel analytics-chart-panel"><div className="analytics-panel-head"><h2>Category Coverage</h2><p>Public repository coverage by category; closed-source tools stay counted.</p></div><CategoryCoverageChart rows={categoryRows} /></article>
        <article className="table-card analytics-panel analytics-chart-panel"><div className="analytics-panel-head"><h2>Snapshot Activity</h2><p>Stored metric snapshots grouped by checked date.</p></div><SnapshotActivityChart rows={snapshotRows} /></article>
      </section>
      <section className="table-card analytics-panel"><div className="analytics-panel-head"><h2>Performance Ranking</h2><p>Score combines source-backed relevance and server-computed freshness.</p></div><div className="agent-table-wrap"><table className="agent-table performance-table"><thead><tr><th>Rank #</th><th>Agent</th><th>Category</th><th>Score</th><th>Confidence</th><th>Stars</th><th>Trend 7d</th><th>Commits 30d</th><th>Repo</th></tr></thead><tbody>{rankedAgents.map((agent, index) => <tr key={(agent.slug || agent.id || agent.name) + "-analytics-" + index}><td><strong>{index + 1}</strong></td><td><button className="agent-cell agent-link" type="button" onClick={() => navigate(agent.publicPath)}><AgentLogo agent={agent} /><div><div className="agent-title">{agent.name}</div><p>{agent.description}</p></div></button></td><td><span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span></td><td><strong>{agent.ranking?.score || rankingScore(agent).score}</strong></td><td>{agent.ranking?.confidence || rankingScore(agent).confidence}%</td><td>{performanceMetric(agent, "stars")}</td><td>{performanceMetric(agent, "trend")}</td><td>{performanceMetric(agent, "commits")}</td><td>{agent.hasPublicRepo ? "Yes" : "No"}</td></tr>)}</tbody></table></div></section>
      <div className="analytics-grid">
        <section className="table-card analytics-panel"><div className="analytics-panel-head"><h2>Category Performance</h2><p>Average score and confidence by agent category.</p></div><div className="agent-table-wrap"><table className="agent-table analytics-table"><thead><tr><th>Category</th><th>Agents</th><th>Avg score</th><th>Confidence</th><th>Public repos</th><th>Closed source</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={row.category}><td>{row.category}</td><td>{row.agents}</td><td>{row.avgScore}</td><td>{row.avgConfidence}%</td><td>{row.publicRepos}</td><td>{row.closedSource}</td></tr>)}</tbody></table></div></section>
        <section className="table-card analytics-panel"><div className="analytics-panel-head"><h2>Data Policy</h2><p>Performance analytics stay honest when data is missing.</p></div><dl className="analytics-notes"><dt>Closed-source agents</dt><dd>Included in rankings when source-backed fields exist; GitHub-only columns show N/A.</dd><dt>Benchmarks</dt><dd>No benchmark score is shown unless a sourced benchmark row exists for that specific agent.</dd><dt>Visitor analytics</dt><dd>No public visitor tracking dashboard is shown here; the visible page is agent performance analytics.</dd></dl></section>
      </div>
    </main>
  );
}

function appurdexAiStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function appurdexAiId() {
  return globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function AppurdexAiPage({ backendAvailable, viewer }) {
  const [experience, setExperience] = useState(() => window.localStorage.getItem("appurdex-ai-experience") || "Regular");
  const [writingStyle, setWritingStyle] = useState(() => window.localStorage.getItem("appurdex-ai-writing-style") || "Default");
  const [sessions, setSessions] = useState(() => appurdexAiStorage("appurdex-ai-sessions", []));
  const [activeId, setActiveId] = useState(() => window.localStorage.getItem("appurdex-ai-active-chat") || "");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const activeSession = sessions.find((item) => item.id === activeId) || sessions[0] || null;
  const telegram = config?.data?.telegram || config?.telegram || null;
  const aiEnabled = Boolean(config?.data?.enabled ?? config?.enabled);
  const model = config?.data?.model || config?.model || configuredAiModelLabel;

  useEffect(() => { window.localStorage.setItem("appurdex-ai-experience", experience); }, [experience]);
  useEffect(() => { window.localStorage.setItem("appurdex-ai-writing-style", writingStyle); }, [writingStyle]);
  useEffect(() => { window.localStorage.setItem("appurdex-ai-sessions", JSON.stringify(sessions.slice(0, 12))); }, [sessions]);
  useEffect(() => { if (activeId) window.localStorage.setItem("appurdex-ai-active-chat", activeId); }, [activeId]);
  useEffect(() => {
    let active = true;
    getAssistantConfig()
      .then((nextConfig) => { if (active) setConfig(nextConfig); })
      .catch((error) => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, []);

  function createChat() {
    const chat = { id: appurdexAiId(), title: "New Chat", createdAt: new Date().toISOString(), messages: [] };
    setSessions((current) => [chat, ...current].slice(0, 12));
    setActiveId(chat.id);
    setStatus("");
  }

  async function submitMessage(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    const chat = activeSession || { id: appurdexAiId(), title: text.slice(0, 42), createdAt: new Date().toISOString(), messages: [] };
    const userMessage = { id: appurdexAiId(), role: "user", content: text, createdAt: new Date().toISOString() };
    setMessage("");
    setLoading(true);
    setStatus("");
    setActiveId(chat.id);
    setSessions((current) => {
      const others = current.filter((item) => item.id !== chat.id);
      return [{ ...chat, title: chat.messages.length ? chat.title : text.slice(0, 42), messages: [...chat.messages, userMessage] }, ...others].slice(0, 12);
    });
    try {
      const result = await sendAssistantMessage({ message: text, experience, writingStyle, history: chat.messages.slice(-8) });
      const reply = result.data || result;
      const assistantMessage = { id: appurdexAiId(), role: "assistant", content: reply.message || "No response text returned.", createdAt: reply.createdAt || new Date().toISOString(), model: reply.model };
      setSessions((current) => current.map((item) => item.id === chat.id ? { ...item, messages: [...item.messages, assistantMessage] } : item));
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content appurdex-ai-content">
      <div className="page-head appurdex-ai-head">
        <div><h1>Appurdex AI</h1><p>Chat with the source-backed Appurdex catalog. Missing facts stay unknown.</p></div>
        <button type="button" onClick={createChat}><MessageSquarePlus size={16} />New Chat</button>
      </div>
      <section className="appurdex-ai-layout">
        <aside className="table-card appurdex-ai-sidebar">
          <div className="appurdex-ai-control-group">
            <label>AI Experience<select value={experience} onChange={(event) => setExperience(event.target.value)}>{APPURDEX_AI_EXPERIENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label>Writing Style<select value={writingStyle} onChange={(event) => setWritingStyle(event.target.value)}>{APPURDEX_AI_WRITING_STYLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          <div className="appurdex-ai-chat-list">
            {sessions.length ? sessions.map((chat) => <button className={chat.id === activeSession?.id ? "active" : ""} type="button" key={chat.id} onClick={() => setActiveId(chat.id)}><strong>{chat.title || "New Chat"}</strong><span>{chat.messages.length} message{chat.messages.length === 1 ? "" : "s"}</span></button>) : <p>No chats yet.</p>}
          </div>
          <div className="appurdex-ai-telegram">
            <div><RadioTower size={17} /><strong>Telegram</strong></div>
            <p>{telegram?.configured ? "Telegram bot is configured for the API service." : "Telegram is not connected yet."}</p>
            {telegram?.connectUrl ? <a href={telegram.connectUrl} target="_blank" rel="noreferrer"><Link2 size={15} />Open Telegram bot</a> : <button type="button" disabled><Link2 size={15} />Connect Telegram</button>}
            {!telegram?.configured ? <small>Configure {telegram?.missingEnv?.join(", ") || "APPURDEX_TELEGRAM_BOT_USERNAME, APPURDEX_TELEGRAM_BOT_TOKEN, APPURDEX_TELEGRAM_WEBHOOK_SECRET"} on the API service.</small> : <small>Webhook path: {telegram.webhookPath}</small>}
          </div>
        </aside>
        <section className="table-card appurdex-ai-panel">
          <div className="appurdex-ai-status-row">
            <span className={backendAvailable ? "fresh-pill fresh" : "fresh-pill muted"}>{backendAvailable ? "API online" : "Static fallback"}</span>
            <span className={aiEnabled ? "fresh-pill fresh" : "fresh-pill unknown"}>{aiEnabled ? "AI configured" : "AI not configured"}</span>
            <span className="fresh-pill muted">{model}</span>
          </div>
          <div className="appurdex-ai-messages" aria-live="polite">
            {activeSession?.messages?.length ? activeSession.messages.map((item) => <article className={item.role === "assistant" ? "assistant" : "user"} key={item.id}><span>{item.role === "assistant" ? "Appurdex AI" : displayUsername(viewer?.user)}</span><p>{item.content}</p>{item.model ? <small>{item.model}</small> : null}</article>) : <div className="appurdex-ai-empty"><Sparkles size={28} /><h2>Start a catalog chat</h2><p>Ask for source-backed comparisons, pricing context, freshness notes, or which agents match a workflow.</p></div>}
            {loading ? <article className="assistant pending"><span>Appurdex AI</span><p>Working from the current catalog context...</p></article> : null}
          </div>
          {status ? <p className="api-message auth-message"><strong>Status</strong><span>{status}</span></p> : null}
          <form className="appurdex-ai-composer" onSubmit={submitMessage}>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask Appurdex AI about agents, pricing, freshness, or market fit..." rows={3} />
            <button type="submit" disabled={!message.trim() || loading}><Send size={16} />Send</button>
          </form>
        </section>
      </section>
    </main>
  );
}
function LearnPage({ navigate }) {
  const categories = [
    ['IDE Assistant', 'Editor-attached tools for inline suggestions, codebase chat, and assisted edits.'],
    ['CLI Agent', 'Terminal-first agents that read files, plan changes, edit code, and run commands.'],
    ['Autonomous Agent', 'Task-oriented agents that can work through issues or larger coding jobs with less step-by-step prompting.'],
    ['App Builder', 'Prompt-to-app tools focused on creating and iterating runnable products.'],
  ];
  return <main className="content learn-content"><div className="page-head"><div><h1>Learn</h1><p>Research guide for choosing AI coding agents, not general AI tools.</p></div></div><section className="learn-grid"><article><h2>Ecosystem overview</h2>{categories.map(([title, body]) => <p key={title}><strong>{title}</strong><span>{body}</span></p>)}</article><article><h2>Pricing models</h2><p><strong>Usage-based</strong><span>Costs change with requests, credits, or tokens.</span></p><p><strong>Seat-based</strong><span>Predictable per-user plans for teams.</span></p><p><strong>Enterprise</strong><span>Custom contracts when public pricing is not available.</span></p></article><article><h2>Access and hosting</h2><p><strong>Open source vs closed</strong><span>Open repos expose GitHub activity; closed tools need other verified sources.</span></p><p><strong>Cloud, local, self-hosted</strong><span>Hosting affects privacy, setup, control, and team operations.</span></p></article><article><h2>Reading Appurdex data</h2><p><strong>Last updated</strong><span>How recently Appurdex synced the listing data.</span></p><p><strong>Freshness</strong><span>A server-computed recency score, not an accuracy guarantee.</span></p><p><strong>Trend</strong><span>Calculated from Appurdex snapshots, never pulled from an external trend API.</span></p></article></section></main>;
}

function PlaceholderPage({ title, children, navigate }) {
  return (
    <main className="content">
      <section className="empty-state">
        <h1>{title}</h1>
        <p>{children}</p>
        <button type="button" onClick={() => navigate("/")}>View overview</button>
      </section>
    </main>
  );
}

function localResearchPrompts() {
  try {
    return JSON.parse(window.localStorage.getItem("appurdex-saved-research-prompts") || "[]");
  } catch {
    return [];
  }
}

function rememberResearchPrompt(query) {
  const value = String(query || "").trim();
  if (!value) return;
  const next = [value, ...localResearchPrompts().filter((item) => item !== value)].slice(0, 8);
  window.localStorage.setItem("appurdex-saved-research-prompts", JSON.stringify(next));
}

function ResearchPage({ navigate }) {
  const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runSearch(nextQuery = query) {
    const submitted = String(nextQuery || "").trim();
    if (!submitted) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await researchSearch(submitted);
      setResult(response.data || response);
      rememberResearchPrompt(submitted);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) runSearch(initialQuery);
  }, [initialQuery]);

  const groups = result?.groups || [];
  const suggestion = result?.compareSuggestion || null;

  return (
    <main className="content research-content">
      <div className="page-head"><div><h1>Research Search</h1><p>Natural-language search over source-backed Appurdex records. LLM parsing is used only when configured.</p></div></div>
      <form className="table-card research-search-card" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
        <label className="global-search research-search-input"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="research all agents, free tools with multi-model support, everything from Anthropic..." /><kbd>NL</kbd></label>
        <button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</button>
      </form>
      {message ? <p className="api-message"><strong>Status</strong><span>{message}</span></p> : null}
      {result ? (
        <section className="table-card research-results-card">
          <div className="analytics-panel-head"><div><h2>Summary</h2><p>{result.summary}</p></div><span className="fresh-pill muted">{result.parserSource || "rules"} parser</span></div>
          {result.llmFallback && result.llmFallback !== "not_needed" ? <p className="compare-note">LLM fallback: {result.llmFallback === "unconfigured" ? "unconfigured - set OPENAI_API_KEY to enable Responses API structured parsing." : result.llmFallback}</p> : null}
          {suggestion ? <button className="inline-link as-button research-compare-button" type="button" onClick={() => navigate(suggestion.path)}><SlidersHorizontal size={15} />Compare {suggestion.slugs.length} close matches</button> : null}
          {groups.length ? groups.map((group) => (
            <article className="research-group" key={group.label}>
              <h3>{group.label}</h3>
              <div className="agent-table-wrap"><table className="agent-table research-table"><thead><tr><th>Product</th><th>Category</th><th>Pricing</th><th>Model flexibility</th><th>Verified</th><th>Source</th></tr></thead><tbody>{group.items.map((item) => <tr key={item.slug}><td><button className="agent-name-button" type="button" onClick={() => navigate("/" + item.slug)}>{item.name}</button></td><td>{item.category || "Unknown"}</td><td>{item.pricing || "Unknown"}</td><td>{item.modelFlexibility || "Unknown"}</td><td>{item.verifiedAt ? relativeTime(item.verifiedAt) : item.verificationStatus || "Unknown"}</td><td>{item.sourceUrl ? <a className="inline-link" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Source</a> : "Unknown"}</td></tr>)}</tbody></table></div>
            </article>
          )) : <section className="empty-state"><h1>No matching source-backed records</h1><p>Try a broader query or review source coverage. No placeholder recommendations are shown.</p></section>}
        </section>
      ) : <section className="empty-state"><h1>Ask a product research question</h1><p>Results will use only stored Appurdex records and explicit unknown states.</p></section>}
    </main>
  );
}

function SavedPage({ agents, viewer, navigate }) {
  const [watchlists, setWatchlists] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("Watchlist");
  const [slugs, setSlugs] = useState("");
  const [selectedAlertTypes, setSelectedAlertTypes] = useState(WATCHLIST_ALERT_OPTIONS.map((option) => option.id));
  const user = viewer?.user || null;
  const canSave = Boolean(viewer?.access?.watchlists || viewer?.access?.savedComparisons);
  const knownSlugs = new Set((agents || []).map((agent) => agent.slug).filter(Boolean));

  async function loadSaved() {
    if (!user || !canSave) return;
    setMessage("");
    try {
      const [watchlistResult, comparisonResult] = await Promise.all([getAccountWatchlists(), getSavedComparisons()]);
      setWatchlists(watchlistResult.data || watchlistResult || []);
      setComparisons(comparisonResult.data || comparisonResult || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => { loadSaved(); }, [user?.id, canSave]);

  function toggleAlertType(alertType) {
    setSelectedAlertTypes((current) => current.includes(alertType) ? current.filter((item) => item !== alertType) : [...current, alertType]);
  }

  async function createSaved(kind) {
    const requestedSlugs = slugs.split(",").map((item) => item.trim()).filter(Boolean);
    const validSlugs = requestedSlugs.filter((slug) => knownSlugs.has(slug));
    if (!validSlugs.length) {
      setMessage("Enter one or more existing product slugs from the directory.");
      return;
    }
    if (kind === "watchlist" && !selectedAlertTypes.length) {
      setMessage("Select at least one watchlist alert type.");
      return;
    }
    try {
      if (kind === "watchlist") {
        await createAccountWatchlist({
          name,
          items: validSlugs.map((productId) => ({ productId, alertTypes: selectedAlertTypes })),
          agentSlugs: validSlugs,
          alertTypes: selectedAlertTypes,
        });
      } else {
        await createSavedComparison({ name: name || "Saved comparison", mode: "products", slugs: validSlugs.slice(0, 5) });
      }
      setSlugs("");
      await loadSaved();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function removeSaved(kind, id) {
    try {
      if (kind === "watchlist") await deleteAccountWatchlist(id);
      else await deleteSavedComparison(id);
      await loadSaved();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function watchlistItems(item) {
    if (Array.isArray(item.items) && item.items.length) return item.items;
    return (item.agentSlugs || []).map((productId) => ({ productId, alertTypes: WATCHLIST_ALERT_OPTIONS.map((option) => option.id) }));
  }

  if (!user) return <PlaceholderPage title="Watchlist" navigate={navigate}>Sign in on the API page before saving account watchlists or comparisons.</PlaceholderPage>;
  if (!canSave) {
    const prompts = localResearchPrompts();
    return <main className="content"><div className="page-head"><div><h1>Watchlist</h1><p>Free accounts keep local research prompt history only. Account watchlists and saved comparisons require Starter or Pro.</p></div></div><section className="table-card saved-section"><h2>Local research prompts</h2>{prompts.length ? prompts.map((prompt) => <button className="saved-row-button" type="button" key={prompt} onClick={() => navigate("/research?q=" + encodeURIComponent(prompt))}>{prompt}</button>) : <p>No local research prompts saved yet.</p>}</section></main>;
  }

  return (
    <main className="content saved-content">
      <div className="page-head"><div><h1>Watchlist</h1><p>Track source-backed tools with per-type alert preferences.</p></div></div>
      {message ? <p className="api-message"><strong>Status</strong><span>{message}</span></p> : null}
      <section className="table-card saved-create-card watchlist-create-card">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Product slugs<input value={slugs} onChange={(event) => setSlugs(event.target.value)} placeholder="cursor, claude-code" /></label>
        <div className="watchlist-alert-options" aria-label="Watchlist alert types">
          {WATCHLIST_ALERT_OPTIONS.map((option) => {
            const Icon = option.icon;
            return <label key={option.id}><input type="checkbox" checked={selectedAlertTypes.includes(option.id)} onChange={() => toggleAlertType(option.id)} /><Icon size={14} />{option.label}</label>;
          })}
        </div>
        <div className="api-action-row"><button type="button" onClick={() => createSaved("watchlist")}>Create watchlist</button><button type="button" onClick={() => createSaved("comparison")}>Save comparison</button></div>
      </section>
      <section className="saved-grid">
        <article className="table-card saved-section"><h2>Watchlists</h2>{watchlists.length ? watchlists.map((item) => <div className="saved-record" key={item.id}><strong>{item.name}</strong>{watchlistItems(item).map((entry) => <span key={entry.productId}>{entry.productId} - {(entry.alertTypes || []).map(alertTypeLabel).join(", ")}</span>)}<button type="button" onClick={() => removeSaved("watchlist", item.id)}>Delete</button></div>) : <p>No watchlists stored yet.</p>}</article>
        <article className="table-card saved-section"><h2>Saved comparisons</h2>{comparisons.length ? comparisons.map((item) => <div className="saved-record" key={item.id}><strong>{item.name}</strong><span>{(item.slugs || []).join(", ") || "No slugs"}</span><button type="button" onClick={() => navigate("/compare?agents=" + encodeURIComponent((item.slugs || []).join(",")))}>Open</button><button type="button" onClick={() => removeSaved("comparison", item.id)}>Delete</button></div>) : <p>No saved comparisons stored yet.</p>}</article>
      </section>
    </main>
  );
}

function AlertTypeBadge({ changeType }) {
  const Icon = alertTypeIcon(changeType);
  return <span className={"alert-type-badge " + (changeType || "unknown")}><Icon size={13} />{alertTypeLabel(changeType)}</span>;
}

function AlertsPage({ state, viewer, navigate }) {
  const alerts = state.alerts || [];
  if (!viewer?.access?.alerts) return <PlaceholderPage title="Alerts" navigate={navigate}>Pro alerts are gated. No fake alert stream is shown for Free or Starter accounts.</PlaceholderPage>;
  return <main className="content alerts-content"><div className="page-head"><div><h1>Alerts</h1><p>Source-change alerts from real review and source-check events.</p></div></div><section className="table-card saved-section">{alerts.length ? alerts.map((item) => <article className="alert-record" key={item.id}><AlertTypeBadge changeType={item.changeType} /><strong>{item.title}</strong><p>{item.detail}</p><small>{item.detectedAt ? relativeTime(item.detectedAt) : item.updatedAt ? relativeTime(item.updatedAt) : relativeTime(item.createdAt)}</small>{item.sourceUrl ? <a className="inline-link" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Source</a> : null}</article>) : <p>No source-change alerts are stored yet.</p>}</section></main>;
}
const subscriberEndpoints = [
  ["POST /api/search/research", "Natural-language research search with rule parsing and optional OpenAI Responses API structured fallback."],
  ["GET /api/v1/agents", "Starter and above: snapshot endpoint for source-backed agent records, source links, categories, and snapshot metrics."],
  ["GET /api/v1/agents/:slug", "Starter and above: snapshot endpoint for one agent record by slug."],
  ["GET /api/v1/categories", "Starter and above: category names from the tracked Appurdex catalog."],
  ["GET /api/v1/pricing", "Starter and above: normalized product pricing plus reviewed model-pricing refs."],
  ["GET /api/v1/model-pricing", "Starter and above: source-backed token pricing rows and source freshness state."],
  ["GET /api/v1/source-catalog", "Starter and above: source categories, resale/use policy notes, and field-source policy metadata."],
  ["GET/POST/DELETE /api/v1/watchlists", "Starter and above: account watchlists."],
  ["GET/POST/DELETE /api/v1/saved-comparisons", "Starter and above: saved comparisons."],
  ["GET /api/v1/alerts", "Pro and Enterprise source-change alerts from real review/source-check events."],
  ["GET/POST/DELETE /api/v1/webhooks", "Pro and Enterprise HMAC-signed webhook endpoints and delivery logs."],
  ["GET /api/v1/history/:slug", "Pro and Enterprise history derived only from stored snapshots and source checks."],
  ["GET /api/v1/appurscore/:slug", "Pro and Enterprise source-backed AppurScore summary."],
  ["GET /api/v1/bulk/agents?format=csv", "Enterprise bulk export."],
];

function formatApiPlanPrice(plan) {
  if (plan.priceMonthly === 0) return "$0/mo";
  if (typeof plan.priceMonthly === "number") return "$" + plan.priceMonthly + "/mo";
  return "Custom";
}

function formatApiLimit(plan) {
  if (plan.apiMonthlyLimit === null) return "Custom monthly volume";
  if (plan.apiMonthlyLimit === 0) return "No monthly API quota";
  return new Intl.NumberFormat("en").format(plan.apiMonthlyLimit) + " API requests/month";
}

function formatApiUsageNumber(value) {
  if (value === null) return "Custom";
  if (value === undefined || value === "") return "0";
  return new Intl.NumberFormat("en").format(Number(value) || 0);
}

function formatApiReset(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

function formatCompareAccess(plan) {
  if (plan.compareLimit) return plan.compareLimit + " public selections";
  return plan.apiAccess ? "Unlimited compare builder" : "Limited compare";
}
function ApiPage({ state, backendAvailable, navigate, viewer, reloadViewer }) {
  const sourceCount = (state.freeDataSources || []).length;
  const categoryCount = new Set((state.agents || []).map((agent) => agent.category).filter(Boolean)).size;
  const latestRun = (state.workerRuns || [])[0];
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [apiKey, setApiKey] = useState("");
  const user = viewer?.user || null;
  const config = viewer?.config || {};
  const planId = user?.planId || viewer?.limits?.plan || "free";
  const canUseApi = Boolean(user && viewer?.access?.apiAccess);
  const apiAccessCopy = user ? (canUseApi ? "Your paid account can create subscriber API keys." : "Upgrade to Starter or above before creating API keys.") : "Sign in, then subscribe to Starter or above to create an API key.";
  const emailReady = Boolean(config.emailMagicLink);
  const googleReady = Boolean(config.google);
  const appleReady = false;
  const billingReady = Boolean(config.billing || config.stripe);
  const oauthReady = googleReady;
  const publicApiPlans = apiPlans.filter((plan) => !plan.adminBypass);
  const usage = viewer?.usage || {
    used: 0,
    limit: viewer?.limits?.apiMonthlyLimit ?? 500,
    remaining: viewer?.limits?.apiMonthlyLimit ?? 500,
    resetAt: null,
  };
  const usageLimitLabel = usage.limit === null ? "Custom monthly volume" : formatApiUsageNumber(usage.limit) + " requests/month";
  const usageRemainingLabel = usage.remaining === null ? "Custom" : formatApiUsageNumber(usage.remaining) + " requests";

  async function handleEmailStart(event) {
    event.preventDefault();
    setMessage("");
    setApiKey("");
    try {
      await startEmailSignIn(email);
      setMessage("Magic link sent. Check the email address you entered.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleLogout() {
    setMessage("");
    setApiKey("");
    try {
      await logoutViewer();
      await reloadViewer();
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCheckout(nextPlanId, interval) {
    setMessage("");
    setApiKey("");
    try {
      const result = await createCheckoutSession({ planId: nextPlanId, interval });
      if (result.url) window.location.href = result.url;
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handlePortal() {
    setMessage("");
    try {
      const result = await createPortalSession();
      if (result.url) window.location.href = result.url;
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCreateKey() {
    setMessage("");
    setApiKey("");
    try {
      const result = await createCustomerApiKey({ name: "Appurdex subscriber key" });
      setApiKey(result.apiKey?.token || "");
      await reloadViewer();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="content api-content">
      <div className="page-head">
        <div>
          <h1>Appurdex API</h1>
          <p>Subscriber access for source-backed AI agent records, pricing data, source policy, and categories.</p>
        </div>
        <button type="button" onClick={() => navigate("/admin")}><KeyRound size={16} />Admin</button>
      </div>

      <section className="learn-grid api-doc-grid">
        <article>
          <h2>Account</h2>
          {user ? (
            <>
              <p><strong>Signed in</strong><span>{user.email}</span></p>
              <p><strong>Plan</strong><span>{planId}</span></p>
              <p><strong>Status</strong><span>{user.subscriptionStatus || "free"}</span></p>
              <div className="api-action-row"><button type="button" onClick={handleLogout}>Sign out</button>{billingReady && user.stripeCustomerId ? <button type="button" onClick={handlePortal}>Billing portal</button> : null}</div>
            </>
          ) : (
            <form className="api-signin-form" onSubmit={handleEmailStart}>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
              <button type="submit" disabled={!backendAvailable || !emailReady}>Send magic link</button>
              {!emailReady ? <p className="api-message"><strong>Login</strong><span>Email magic-link sign-in is not configured in this environment.</span></p> : null}
              {oauthReady ? (
                <div className="api-action-row">
                  {googleReady ? <button type="button" onClick={() => { window.location.href = authNavigationUrl("/api/auth/google/start"); }}>Google</button> : null}
                </div>
              ) : null}
            </form>
          )}
          <p><strong>Config</strong><span>Email {emailReady ? "ready" : "missing env"} / Google {googleReady ? "ready" : "missing env"} / Apple locked / Billing {billingReady ? "ready" : config.enabled?.billing ? "missing env" : "later"}</span></p>
          {message ? <p className="api-message"><strong>Message</strong><span>{message}</span></p> : null}
        </article>

        <article className="api-pricing-panel">
          <h2>Plans</h2>
          <div className="api-plan-grid">
            {publicApiPlans.map((plan) => {
              const selfServe = ["starter", "pro"].includes(plan.id);
              return (
                <section className={plan.id === planId ? "api-pricing-card active" : "api-pricing-card"} key={plan.id}>
                  <div className="api-pricing-card-head">
                    <strong>{plan.name}</strong>
                    <span>{formatApiPlanPrice(plan)}</span>
                  </div>
                  <p>{plan.note}</p>
                  <dl>
                    <dt>API limit</dt><dd>{formatApiLimit(plan)}</dd>
                    <dt>Freshness</dt><dd>{plan.freshnessTier || "Public freshness"}</dd>
                    <dt>Compare</dt><dd>{formatCompareAccess(plan)}</dd>
                  </dl>
                  {plan.entitlements?.length ? <ul className="api-entitlement-list">{plan.entitlements.map((item) => <li key={plan.id + item}>{item}</li>)}</ul> : null}
                  {selfServe ? (
                    user && billingReady ? <div className="api-plan-actions"><button type="button" onClick={() => handleCheckout(plan.id, "monthly")}>{plan.name} monthly</button><button type="button" onClick={() => handleCheckout(plan.id, "annual")}>{plan.name} annual</button></div> : <small>{user ? "Billing checkout must be configured before paid API launch." : "Sign in before checkout is available."}</small>
                  ) : plan.id === "enterprise" ? <small>Custom contract, volume, support, SLA, and export terms.</small> : <small>Public browsing plan.</small>}
                </section>
              );
            })}
          </div>
        </article>

        <article>
          <h2>Authentication</h2>
          <p><strong>Header</strong><span>Use <code>x-appurdex-api-key</code> on every subscriber request. Bearer auth is also accepted by the backend.</span></p>
          <p><strong>Access</strong><span>{apiAccessCopy}</span></p>
          <p><strong>Status</strong><span>{backendAvailable ? "Backend is reachable in this session." : "Backend is not reachable from the frontend right now."}</span></p>
          <div className="api-action-row"><button type="button" disabled={!canUseApi} onClick={handleCreateKey}>Create API key</button></div>
          {apiKey ? <p className="api-key-output"><strong>New key</strong><code>{apiKey}</code></p> : null}
        </article>

        <article>
          <h2>Usage</h2>
          <p><strong>Plan</strong><span>{planId}</span></p>
          <p><strong>Monthly limit</strong><span>{usageLimitLabel}</span></p>
          <p><strong>Used</strong><span>{formatApiUsageNumber(usage.used)} requests this month</span></p>
          <p><strong>Remaining</strong><span>{usageRemainingLabel}</span></p>
          <p><strong>Reset</strong><span>{formatApiReset(usage.resetAt)}</span></p>
        </article>

        <article>
          <h2>Catalog Coverage</h2>
          <p><strong>Agents</strong><span>{(state.agents || []).length} records currently loaded from the Appurdex catalog.</span></p>
          <p><strong>Categories</strong><span>{categoryCount} category values available through the categories endpoint.</span></p>
          <p><strong>Sources</strong><span>{sourceCount} source policy records available through the source catalog endpoint.</span></p>
        </article>

        <article>
          <h2>Tiered Sync</h2>
          <p><strong>Endpoint</strong><span><code>GET /api/cron/hourly-sync</code> or <code>POST /api/cron/hourly-sync</code></span></p>
          <p><strong>Cadence</strong><span>`top` through 250 every 30 minutes, `high` through 500 every 1 hour, `mid` through 1,500 every 6 hours, and `long_tail` every 24 hours, within the request budget.</span></p>
          <p><strong>Protection</strong><span>Set <code>APPURDEX_CRON_SECRET</code> or <code>CRON_SECRET</code>, then send it as Bearer auth or <code>x-appurdex-cron-secret</code>.</span></p>
          <p><strong>Last run</strong><span>{latestRun ? `${relativeTime(latestRun.finishedAt)} / checked ${latestRun.results?.length || latestRun.checked || 0}` : "No worker run recorded yet."}</span></p>
        </article>

        <article>
          <h2>Boundary</h2>
          <p><strong>No fake rows</strong><span>Unknown pricing, missing benchmarks, and missing source data stay unknown until reviewed.</span></p>
          <p><strong>Source-change alerts</strong><span>Pro and Enterprise alerts expose only real source-check and review events from the backend.</span></p>
          <p><strong>Pricing</strong><span>The API exposes reviewed pricing fields and source links; it does not scrape and republish pricing pages automatically.</span></p>
        </article>
      </section>

      <section className="table-card api-endpoint-card">
        <div className="analytics-panel-head">
          <h2>Subscriber Endpoints</h2>
          <p>All endpoints below require <code>x-appurdex-api-key</code>.</p>
        </div>
        <div className="api-endpoint-list">
          {subscriberEndpoints.map(([endpoint, description]) => <article key={endpoint}><code>{endpoint}</code><p>{description}</p></article>)}
        </div>
      </section>
    </main>
  );
}function UpdateRequestGate({ agent, updateType = "details", navigate, onClose, asPage = false }) {
  const content = (
    <section className={asPage ? "agent-detail request-panel" : "update-modal-card"}>
      <div className="request-head">
        <div>
          <h1>{asPage ? "Request listing update" : "Sign in to request an update"}</h1>
          <p>Appurdex requires a signed-in account before listing changes can be logged for review.</p>
        </div>
        {!asPage ? <button className="icon-only close-button" type="button" aria-label="Close" onClick={onClose}><X size={17} /></button> : null}
      </div>
      <dl className="request-summary">
        <dt>Record</dt><dd>{agent?.name || "No listing selected"}</dd>
        <dt>Update type</dt><dd>{updateType}</dd>
        <dt>Status</dt><dd>Sign-in route not configured yet</dd>
      </dl>
      <div className="request-actions">
        <button type="button" disabled>Sign in required</button>
        <button type="button" onClick={() => asPage ? navigate(agent?.publicPath || "/") : onClose()}>Back</button>
      </div>
    </section>
  );

  if (asPage) {
    return <main className="content detail-content">{content}</main>;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="update-request-title">
      {content}
    </div>
  );
}

function RequestUpdatePage({ agents, navigate }) {
  const params = new URLSearchParams(window.location.search);
  const requestedSlug = params.get("agent") || "";
  const updateType = params.get("updateType") || "details";
  const requestedAgent = agents.find((agent) => agent.slug === requestedSlug || agent.id === requestedSlug);
  return <UpdateRequestGate agent={requestedAgent} updateType={updateType} navigate={navigate} asPage />;
}

function cleanSourceLabel(label, fallback = 'Official source') {
  const text = String(label || '').trim();
  if (!text || /^(Pricing source|Context source|Benchmark source|Status source)$/i.test(text)) return fallback;
  return text;
}

function cleanDisplayValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  if (/^(No public repo configured|No source-backed product score found|Not measured yet|No dependency count loaded|No license list loaded)/i.test(value)) return null;
  return value;
}

function modelSupportText(agent) {
  const modelSupport = agent.modelSupport;
  if (!modelSupport) return null;
  const providers = Array.isArray(modelSupport.providers) ? modelSupport.providers.join(', ') : modelSupport.providers;
  return [providers, modelSupport.flexibility, modelSupport.choice].filter(Boolean).join(' / ');
}

function latestChangeFor(agent, changeType, fields = []) {
  const changes = Array.isArray(agent?.changeLog) ? agent.changeLog : [];
  const fieldSet = new Set(fields);
  return changes
    .filter((item) => item && item.changeType === changeType && (!fieldSet.size || fieldSet.has(item.field)))
    .sort((a, b) => new Date(b.detectedAt || b.updatedAt || b.createdAt || 0) - new Date(a.detectedAt || a.updatedAt || a.createdAt || 0))[0] || null;
}

function changeValueLabel(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function HistoryIndicator({ change }) {
  const detectedAt = change?.detectedAt || change?.updatedAt || change?.createdAt;
  if (!detectedAt) return null;
  const oldValue = changeValueLabel(change.oldValue);
  const newValue = changeValueLabel(change.newValue);
  const title = [oldValue ? `Old: ${oldValue}` : '', newValue ? `New: ${newValue}` : ''].filter(Boolean).join(' / ');
  return <span className="history-indicator" title={title || 'Change detected'}>changed {relativeTime(detectedAt)}</span>;
}

function modelSupportSourceLink(agent) {
  const modelSupport = agent.modelSupport || {};
  if (!modelSupport.sourceUrl) return null;
  return <a href={modelSupport.sourceUrl} target="_blank" rel="noreferrer">{cleanSourceLabel(modelSupport.sourceLabel, "Model support source")}</a>;
}

function metricRows(agent) {
  const github = agent.githubMetric || {};
  const operational = agent.operationalMetrics || {};
  const adoption = agent.adoptionMetrics || {};
  const capability = agent.capabilityMetrics || {};
  const primarySource = sourceFor(agent, "primary") || null;
  const pricingSource = sourceFor(agent, "pricing") || null;
  const rows = [
    ["Primary source", primarySource?.url ? <a href={primarySource.url} target="_blank" rel="noreferrer">{primarySource.label || "Official source"}</a> : null],
    ["Pricing source", pricingSource?.url ? <a href={pricingSource.url} target="_blank" rel="noreferrer">{cleanSourceLabel(pricingSource.label, "Official pricing page")}</a> : null],
    ["Maintainer", agent.maintainerName || null],
    ["Founded / launch", agent.foundedAt || null],
    ["Models supported", modelSupportText(agent)],
    ["Model source", modelSupportSourceLink(agent)],
    ["Package downloads", adoption.packageDownloadsMonthly || adoption.packageDownloadVelocity || null],
    ["Context limit", capability.effectiveContextLimit || null],
    ["Repository", agent.hasPublicRepo && agent.githubRepo ? <a href={github.sourceUrl || "https://github.com/" + agent.githubRepo} target="_blank" rel="noreferrer">{agent.githubRepo}</a> : "Closed source, no public repository available."],
    ["Stars", typeof github.stars === "number" ? formatNumber(github.stars) : null],
    ["Forks", typeof github.forks === "number" ? formatNumber(github.forks) : null],
    ["Open issues", typeof github.openIssues === "number" ? formatNumber(github.openIssues) : null],
    ["Contributors", typeof github.contributorCount === "number" ? formatNumber(github.contributorCount) : null],
    ["Commits 30d", typeof github.commitCount30d === "number" ? formatNumber(github.commitCount30d) : null],
    ["Last push", github.lastCommitDate ? relativeTime(github.lastCommitDate) : null],
    ["Latest release", github.latestReleaseDate ? relativeTime(github.latestReleaseDate) : null],
    ["Release cadence", typeof github.releaseCadenceDays === "number" ? github.releaseCadenceDays + "d" : null],
    ["License", github.license || null],
    ["Trend 7d", typeof github.trend7dPct === "number" ? (github.trend7dPct >= 0 ? "+" : "") + github.trend7dPct + "%" : null],
    ["Trend 30d", typeof github.trend30dPct === "number" ? (github.trend30dPct >= 0 ? "+" : "") + github.trend30dPct + "%" : null],
  ];
  return rows.map(([label, value]) => [label, cleanDisplayValue(value)]).filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function analyticsRows(agent) {
  return [
    ["Market position", agent.marketPosition?.label ? `#${agent.marketPosition.rankPriority} ${agent.marketPosition.label}` : null],
    ["Stars", performanceMetric(agent, "stars")],
    ["Trend 7d", performanceMetric(agent, "trend")],
    ["Commits 30d", performanceMetric(agent, "commits")],
    ["Repo", agent.hasPublicRepo ? "Yes" : "No"],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function verifiedPlanValue(value, fallback = "Not verified") {
  const text = String(value || "").trim();
  return text || fallback;
}

function pricingPlansForDisplay(agent) {
  return Array.isArray(agent.pricingPlans) ? agent.pricingPlans.filter((plan) => hasResearchValue(plan, ["name", "price", "billingPeriod", "requestLimit", "rateLimit", "messageLimit", "tokenLimit", "limits", "sourceUrl"])) : [];
}

function pricingPlanPriceForDisplay(plan) {
  const price = cleanDisplayValue(plan.price);
  if (!price) return "N/A";
  if (/^(plan included|included)$/i.test(price)) return "Included";
  if (/^plan dependent$/i.test(price)) return "Plan dependent";
  if (/^custom( pricing)?$/i.test(price)) return "Custom";
  return price;
}

function pricingPlanBillingForDisplay(plan) {
  const billingPeriod = cleanDisplayValue(plan.billingPeriod);
  if (!billingPeriod || typeof billingPeriod !== "string") return billingPeriod || "N/A";
  return billingPeriod.replace(/^(\s*)([a-z])/, (_, leading, letter) => leading + letter.toUpperCase());
}

function PricingTierName({ plan, fallback }) {
  const name = cleanDisplayValue(plan.name) || fallback;
  if (!plan.sourceUrl) return <span className="pricing-tier-name">{name}</span>;
  return (
    <a className="pricing-tier-name pricing-tier-link" href={plan.sourceUrl} target="_blank" rel="noreferrer" title={cleanSourceLabel(plan.sourceLabel, "Official pricing page")}>
      {name}
      <ExternalLink size={12} />
    </a>
  );
}

function PricingPlanList({ plans }) {
  if (!plans.length) return <span className="empty-value">No verified pricing tiers yet.</span>;
  const columns = [
    ['requestLimit', 'Request limit'],
    ['messageLimit', 'Message limit'],
    ['tokenLimit', 'Token limit'],
    ['limits', 'Other limits'],
  ].filter(([key]) => plans.some((plan) => cleanDisplayValue(plan[key] || (key === 'requestLimit' ? plan.rateLimit : null))));
  const missingLimitNote = columns.length === 0 ? <p className="pricing-note">Rate, message, and token limits are not publicly disclosed.</p> : null;
  return (
    <div className="pricing-plan-list">
      {missingLimitNote}
      <table className="pricing-plan-table"><thead><tr><th>Tier</th><th>Price</th><th>Billing / plan</th>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{plans.map((plan, index) => (
        <tr key={(plan.name || 'tier') + '-' + index}>
          <td><PricingTierName plan={plan} fallback={'Tier ' + (index + 1)} /></td>
          <td>{pricingPlanPriceForDisplay(plan)}</td>
          <td>{pricingPlanBillingForDisplay(plan)}</td>
          {columns.map(([key]) => <td key={key}>{cleanDisplayValue(plan[key] || (key === 'requestLimit' ? plan.rateLimit : null)) || 'N/A'}</td>)}
        </tr>
      ))}</tbody></table>
    </div>
  );
}
const tokenPriceGroups = {
  input: [
    ['input', 'Input'],
    ['inputText', 'Text'],
    ['inputTextImageVideo', 'Text/image/video'],
    ['inputAudio', 'Audio'],
    ['inputLongContext', 'Long context'],
    ['inputOver200k', '>200k'],
  ],
  cached: [
    ['cachedInput', 'Cached input'],
    ['cachedInputLongContext', 'Cached long'],
    ['cacheHit', 'Cache hit'],
    ['contextCache', 'Context cache'],
    ['contextCacheOver200k', 'Context >200k'],
    ['contextCacheTextImageVideo', 'Cache text/image/video'],
    ['contextCacheAudio', 'Cache audio'],
  ],
  cacheWrite: [
    ['cacheWrite5m', '5m write'],
    ['cacheWrite1h', '1h write'],
    ['cacheStoragePerHour', 'Storage/hr'],
  ],
  output: [
    ['output', 'Output'],
    ['outputLongContext', 'Long context'],
    ['outputOver200k', '>200k'],
  ],
};

function formatMTokenPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' / MTok';
}

function TokenPriceCell({ prices, group }) {
  const rows = (tokenPriceGroups[group] || [])
    .map(([key, label]) => [label, formatMTokenPrice(prices?.[key])])
    .filter(([, value]) => value);
  if (!rows.length) return <span className="metric-na">N/A</span>;
  return <span className="token-price-stack">{rows.map(([label, value]) => <span key={label}><strong>{label}</strong>{value}</span>)}</span>;
}


function resolveTokenPricingRows(agent, modelPricing = []) {
  const rows = Array.isArray(modelPricing) ? modelPricing : [];
  const exactRefs = Array.isArray(agent?.modelPricingRefs) ? agent.modelPricingRefs.filter(Boolean) : [];
  const sourceRefs = Array.isArray(agent?.modelPricingSourceRefs) ? agent.modelPricingSourceRefs.filter(Boolean) : [];
  const matched = exactRefs.length
    ? rows.filter((row) => exactRefs.includes(row.id))
    : rows.filter((row) => sourceRefs.includes(row.sourceId));
  const seen = new Set();
  return matched.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return Array.isArray(row.pricingPlans) && row.pricingPlans.length > 0;
  });
}

const deprecatedModelStatuses = new Set(['deprecated', 'retired', 'retired_except_cloud']);
const scheduledModelStatuses = new Set(['scheduled']);

function normalizedModelStatus(status) {
  return String(status || 'current').toLowerCase();
}

function isDeprecatedModel(row) {
  return deprecatedModelStatuses.has(normalizedModelStatus(row.status));
}

function isScheduledModel(row) {
  return scheduledModelStatuses.has(normalizedModelStatus(row.status));
}

function isCurrentModel(row) {
  return !isDeprecatedModel(row) && !isScheduledModel(row);
}

function modelStatusLabel(status) {
  const normalized = normalizedModelStatus(status);
  if (normalized === 'retired_except_cloud') return 'Retired';
  if (normalized === 'limited_availability') return 'Current';
  if (normalized === 'preview') return 'Current';
  return normalized.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function modelStatusTone(row) {
  if (isDeprecatedModel(row)) return 'muted';
  if (isScheduledModel(row)) return 'scheduled';
  return 'current';
}

function modelPlanByKind(row, kind) {
  return (row.pricingPlans || []).find((plan) => String(plan.id || plan.name || '').toLowerCase().includes(kind));
}

function otherModelPlans(row) {
  return (row.pricingPlans || []).filter((plan) => {
    const key = String(plan.id || plan.name || '').toLowerCase();
    return !key.includes('standard') && !key.includes('batch');
  });
}

function lowestInputPrice(row) {
  const values = (row.pricingPlans || []).flatMap((plan) => Object.entries(plan.pricesUsdPerMillion || {})
    .filter(([key, value]) => key.toLowerCase().includes('input') && typeof value === 'number' && Number.isFinite(value))
    .map(([, value]) => value));
  return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
}

function tokenPricingDateValue(row) {
  const value = row.effectiveFrom || row.effectiveUntil || row.last_synced_at || row.lastSyncedAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function modelVersionParts(row) {
  const raw = [row.modelId, row.model, row.id].filter(Boolean).join(" ").toLowerCase();
  const normalized = raw.replace(/(\d)-(?=\d)/g, '$1.');
  const familyMatch = normalized.match(/\b(?:gpt|claude|gemini|o|llama|mistral)[\w.-]*?(\d+(?:\.\d+)*)/i);
  const fallbackMatch = normalized.match(/\b(\d+(?:\.\d+)*)\b/);
  const version = familyMatch?.[1] || fallbackMatch?.[1] || "";
  return version.split(".").map((part) => Number(part)).filter((part) => Number.isFinite(part));
}

function compareModelVersionDesc(a, b) {
  const left = modelVersionParts(a);
  const right = modelVersionParts(b);
  if (left.length !== right.length && (!left.length || !right.length)) return left.length ? -1 : 1;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (right[index] || 0) - (left[index] || 0);
    if (diff) return diff;
  }
  return compareText(a.model, b.model);
}

function compareModelVersionAsc(a, b) {
  const left = modelVersionParts(a);
  const right = modelVersionParts(b);
  if (left.length !== right.length && (!left.length || !right.length)) return left.length ? -1 : 1;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff;
  }
  return compareText(a.model, b.model);
}

function compareTokenPricingDatesAsc(a, b) {
  const left = tokenPricingDateValue(a);
  const right = tokenPricingDateValue(b);
  if (left && right && left !== right) return left - right;
  if (left !== right) return left ? -1 : 1;
  return compareModelVersionAsc(a, b);
}

function compareTokenPricingDatesDesc(a, b) {
  const left = tokenPricingDateValue(a);
  const right = tokenPricingDateValue(b);
  if (left && right && left !== right) return right - left;
  if (left !== right) return left ? -1 : 1;
  return compareModelVersionDesc(a, b);
}

function sortTokenPricingRows(rows, sortBy) {
  const copy = [...rows];
  if (sortBy === 'input-desc') return copy.sort((a, b) => lowestInputPrice(b) - lowestInputPrice(a) || a.model.localeCompare(b.model));
  if (sortBy === 'status') return copy.sort((a, b) => modelStatusLabel(a.status).localeCompare(modelStatusLabel(b.status)) || a.model.localeCompare(b.model));
  if (sortBy === 'newest') return copy.sort(compareTokenPricingDatesDesc);
  if (sortBy === 'oldest') return copy.sort(compareTokenPricingDatesAsc);
  if (sortBy === 'scheduled') return copy.sort((a, b) => Number(isScheduledModel(b)) - Number(isScheduledModel(a)) || compareTokenPricingDatesAsc(a, b));
  if (sortBy === 'deprecated') return copy.sort((a, b) => Number(isDeprecatedModel(b)) - Number(isDeprecatedModel(a)) || compareTokenPricingDatesDesc(a, b));
  if (sortBy === 'model') return copy.sort((a, b) => a.model.localeCompare(b.model));
  return copy.sort((a, b) => lowestInputPrice(a) - lowestInputPrice(b) || a.model.localeCompare(b.model));
}

function filterTokenPricingRows(rows, statusFilter) {
  if (statusFilter === 'all') return rows;
  if (statusFilter === 'scheduled') return rows.filter(isScheduledModel);
  if (statusFilter === 'deprecated') return rows.filter(isDeprecatedModel);
  return rows.filter(isCurrentModel);
}

function TokenPlanPriceBlock({ plan }) {
  if (!plan) return <span className="metric-na">N/A</span>;
  return (
    <div className="token-plan-price-block">
      <TokenPriceCell prices={plan.pricesUsdPerMillion} group="input" />
      <TokenPriceCell prices={plan.pricesUsdPerMillion} group="cached" />
      <TokenPriceCell prices={plan.pricesUsdPerMillion} group="cacheWrite" />
      <TokenPriceCell prices={plan.pricesUsdPerMillion} group="output" />
    </div>
  );
}

function OtherTokenPlans({ plans }) {
  if (!plans.length) return <span className="metric-na">N/A</span>;
  return (
    <div className="other-token-plan-list">
      {plans.map((plan) => (
        <span key={plan.id || plan.name}>
          <strong>{plan.name || plan.id}</strong>
          <TokenPriceCell prices={plan.pricesUsdPerMillion} group="input" />
          <TokenPriceCell prices={plan.pricesUsdPerMillion} group="output" />
        </span>
      ))}
    </div>
  );
}

function TokenPricingRows({ rows }) {
  return rows.map((row) => {
    const standardPlan = modelPlanByKind(row, 'standard');
    const batchPlan = modelPlanByKind(row, 'batch');
    const otherPlans = otherModelPlans(row);
    return (
      <tr key={row.id}>
        <td><span className="pricing-tier-name"><strong>{row.model}</strong>{row.availabilityNote ? <small>{row.availabilityNote}</small> : null}</span></td>
        <td><span className={'model-status-pill ' + modelStatusTone(row)}>{modelStatusLabel(row.status)}</span></td>
        <td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">Source</a> : <span className="metric-na">N/A</span>}</td>
        <td><TokenPlanPriceBlock plan={standardPlan} /></td>
        <td><TokenPlanPriceBlock plan={batchPlan} /></td>
        <td><OtherTokenPlans plans={otherPlans} /></td>
      </tr>
    );
  });
}

function TokenPricingTable({ rows }) {
  if (!rows.length) return <p className="empty-value">No model pricing rows match this filter.</p>;
  return (
    <div className="pricing-plan-list token-pricing-list">
      <table className="pricing-plan-table token-pricing-table">
        <thead><tr><th>Model</th><th>Status</th><th>Source</th><th>Standard API</th><th>Batch API</th><th>Other plans</th></tr></thead>
        <tbody><TokenPricingRows rows={rows} /></tbody>
      </table>
    </div>
  );
}

function TokenUsagePricingTable({ rows }) {
  const [statusFilter, setStatusFilter] = useState('current');
  const [sortBy, setSortBy] = useState('newest');
  if (!rows.length) return null;
  const sourceRows = [...new Map(rows.map((row) => [row.sourceUrl || row.sourceId || row.id, row])).values()];
  const filteredRows = sortTokenPricingRows(filterTokenPricingRows(rows, statusFilter), sortBy);
  const deprecatedRows = sortTokenPricingRows(rows.filter(isDeprecatedModel), sortBy);
  const statusLabels = { current: 'Current', scheduled: 'Scheduled', deprecated: 'Deprecated/retired', all: 'All' };
  const sortLabels = { 'input-asc': 'input price low-high', 'input-desc': 'input price high-low', newest: 'newest source date/version', oldest: 'oldest source date/version', scheduled: 'scheduled first', deprecated: 'deprecated first', status: 'status', model: 'model name' };
  const showDeprecatedDisclosure = statusFilter === 'current' && deprecatedRows.length > 0;
  return (
    <div className="directory-pricing-tiers token-pricing-section">
      <div className="token-pricing-head">
        <div>
          <h2>Token usage pricing</h2>
          <p className="pricing-note">{sourceRows.map((row, index) => (
            <Fragment key={row.sourceUrl || row.sourceId || row.id}>
              {index ? ' / ' : ''}
              {row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{cleanSourceLabel(row.sourceLabel, (row.provider ? row.provider + ' pricing' : 'Official pricing'))}</a> : cleanSourceLabel(row.sourceLabel, (row.provider ? row.provider + ' pricing' : 'Official pricing'))}
              {row.syncAgeLabel ? ' - Last synced ' + row.syncAgeLabel : ''}
            </Fragment>
          ))}</p>
        </div>
        <div className="token-pricing-controls" aria-label="Token pricing controls">
          <label htmlFor="token-status-filter">Status
            <select id="token-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="current">Current</option>
              <option value="scheduled">Scheduled</option>
              <option value="deprecated">Deprecated/retired</option>
              <option value="all">All</option>
            </select>
          </label>
          <label htmlFor="token-sort-filter">Sort
            <select id="token-sort-filter" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="input-asc">Input price low-high</option>
              <option value="input-desc">Input price high-low</option>
              <option value="scheduled">Scheduled first</option>
              <option value="deprecated">Deprecated first</option>
              <option value="status">Status</option>
              <option value="model">Model</option>
            </select>
          </label>
        </div>
      </div>
      <p className="token-pricing-summary">Showing {filteredRows.length} {statusLabels[statusFilter].toLowerCase()} model{filteredRows.length === 1 ? '' : 's'}, sorted by {sortLabels[sortBy]}.</p>
      <TokenPricingTable rows={filteredRows} />
      {showDeprecatedDisclosure ? (
        <details className="deprecated-token-pricing">
          <summary>Deprecated/retired models ({deprecatedRows.length})</summary>
          <TokenPricingTable rows={deprecatedRows} />
        </details>
      ) : null}
    </div>
  );
}
function AgentAnalyticsChart({ agent }) {
  const ranking = agent.ranking || rankingScore(agent);
  const metrics = [
    ["Score", ranking.score],
    ["Confidence", ranking.confidence],
    ["Adoption", ranking.adoption],
    ["Momentum", ranking.momentum],
    ["Reliability", ranking.reliability],
    ["Freshness", ranking.freshness],
  ];
  return (
    <div className="detail-analytics-chart" aria-label="Agent analytics score breakdown">
      {metrics.map(([label, value]) => {
        const available = typeof value === 'number' && value > 0;
        return (
          <div className={'detail-analytics-row ' + (available ? '' : 'unavailable')} key={label}>
            <span>{label}</span>
            {available ? <div className="detail-analytics-track"><i style={{ "--metric-width": clamp(value) + "%" }} /></div> : <span className="analytics-unavailable-note">Not yet available</span>}
            <strong>{available ? value + (label === "Confidence" ? "%" : "") : "N/A"}</strong>
          </div>
        );
      })}
    </div>
  );
}
function AgentDetailPage({ agent, navigate, modelPricing = [] }) {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  if (!agent) return <main className="content"><section className="empty-state"><h1>AI listing not found</h1><button type="button" onClick={() => navigate("/")}>Back to overview</button></section></main>;
  const rows = metricRows(agent);
  const analytics = analyticsRows(agent);
  const pricingPlans = pricingPlansForDisplay(agent);
  const tokenPricingRows = resolveTokenPricingRows(agent, modelPricing);
  const socials = socialLinksFor(agent);
  const fresh = { label: agent.syncAgeLabel ? "Last updated " + agent.syncAgeLabel : "Last updated: not synced", tone: agent.syncAgeTone || "unknown" };
  const primarySource = sourceFor(agent, "primary");
  const pricingSource = sourceFor(agent, "pricing");
  const websiteUrl = websiteUrlFor(agent);
  const accessChange = latestChangeFor(agent, "access", ["access"]);
  const modelFlexibilityChange = latestChangeFor(agent, "access", ["modelSupport"]);
  const modelFlexibility = modelSupportText(agent) || "Unknown";
  return (
    <main className="content detail-content"><button className="back-button" type="button" onClick={() => navigate("/")}>Back to overview</button><section className="agent-detail">
      <div className="agent-detail-head"><AgentLogo agent={agent} /><div><h1>{agent.name}</h1><p>{agent.description}</p><div className="badge-row"><span className={"category-pill " + (categoryClass[agent.category] || "blue")}>{agent.displayCategory}</span><span className={"fresh-pill " + fresh.tone}>{fresh.label}</span></div>{socials.length ? <div className="social-link-row">{socials.map((link) => { const Icon = link.icon || ExternalLink; return <a key={link.url} href={link.url} target="_blank" rel="noreferrer" title={link.label} aria-label={link.label}><Icon size={16} /><span>{link.label}</span></a>; })}</div> : null}</div><div className="detail-actions">{websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Website</a> : null}<button type="button" onClick={() => setShowUpdateModal(true)}>Request update</button></div></div>
      <div className="detail-source-strip" aria-label="Source and provenance summary"><span><CheckCircle2 size={14} />Source-backed record</span>{websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Website</a> : <span>Website unknown</span>}{primarySource?.url ? <a href={primarySource.url} target="_blank" rel="noreferrer"><BookOpen size={14} />{cleanSourceLabel(primarySource.label, "Primary source")}</a> : <span>Primary source unknown</span>}{pricingSource?.url ? <a href={pricingSource.url} target="_blank" rel="noreferrer"><CircleDollarSign size={14} />Pricing source</a> : <span>Pricing source unknown</span>}<span className={"fresh-pill sync-badge " + fresh.tone}>{fresh.label}</span></div>
      <div className="detail-grid"><article><h2>Verified metrics</h2>{rows.length ? <dl>{rows.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl> : <p>No additional metrics are tracked for this agent yet.</p>}</article><article>{pricingPlans.length ? <div className="directory-pricing-tiers"><h2>Pricing tiers</h2><PricingPlanList plans={pricingPlans} /></div> : null}<TokenUsagePricingTable rows={tokenPricingRows} /><div className="directory-fields-block"><h2>Directory fields</h2><dl><dt>Pricing</dt><dd>{agent.price}</dd><dt>Access</dt><dd><span>{agent.access}</span><HistoryIndicator change={accessChange} /></dd><dt>Model Flexibility</dt><dd><span>{modelFlexibility}</span><HistoryIndicator change={modelFlexibilityChange} /></dd><dt>Hosting</dt><dd>{agent.hosting}</dd><dt>Last synced</dt><dd>{agent.syncAgeLabel || "Not synced"}</dd></dl></div></article><article className="detail-analytics-card"><h2>Analytics</h2><AgentAnalyticsChart agent={agent} /><dl>{analytics.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl></article></div>
      <section className="detail-review-note"><h2>Need to update this listing?</h2><button type="button" onClick={() => setShowUpdateModal(true)}><UploadCloud size={16} />Send for review</button></section>
    </section>{showUpdateModal ? <UpdateRequestGate agent={agent} updateType="details" navigate={navigate} onClose={() => setShowUpdateModal(false)} /> : null}</main>
  );
}

function AdminDashboard({ state, agents, navigate, reload, backendAvailable }) {
  const [newKey, setNewKey] = useState({ ownerName: "", ownerEmail: "", planId: "pro" });
  const [createdKey, setCreatedKey] = useState("");
  const [message, setMessage] = useState("");

  async function handleCreateKey(event) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await createApiKey(newKey);
      setCreatedKey(result.apiKey.token);
      setNewKey({ ownerName: "", ownerEmail: "", planId: "pro" });
      await reload();
    } catch (error) {
      setMessage(`API key not created: ${backendAvailable ? error.message : "backend is not running."}`);
    }
  }

  async function handleRunWorker() {
    setMessage("");
    try {
      await runWorkerNow();
      setMessage("Worker completed. Review queue and source checks refreshed.");
      await reload();
    } catch (error) {
      setMessage(`Worker not run: ${backendAvailable ? error.message : "backend is not running."}`);
    }
  }

  async function resolveItem(id, status) {
    try {
      await updateReviewItem(id, { status });
      await reload();
    } catch (error) {
      setMessage(`Review item not updated: ${error.message}`);
    }
  }

  return (
    <main className="content admin-content">
      <div className="page-head">
        <div>
          <h1>Appurdex Admin</h1>
          <p>Backend surface for source checks, vendor claims, suggested updates, API subscribers, and listing edits.</p>
        </div>
        <div className="status-cluster">
          <div><strong>{state.reviewQueue?.filter((item) => item.status === "pending").length || 0} pending reviews</strong><span><i />{backendAvailable ? "Backend online" : "Backend offline"}</span></div>
          <div><strong>{configuredAiModelLabel}</strong><span>Configured model</span></div>
          <button type="button" onClick={() => navigate("/admin/research")}><FileText size={16} />Research Admin</button>
          <button type="button" onClick={handleRunWorker}><RefreshCw size={16} />Run worker</button>
        </div>
      </div>

      <div className="admin-grid">
        <section className="admin-card">
          <h2>AI listings</h2>
          <div className="admin-list">
            {agents.map((agent, index) => (
              <button type="button" key={(agent.slug || agent.id || agent.name) + "-admin-" + index} onClick={() => navigate(agent.adminPath)}>
                <span>{agent.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <h2>Review queue</h2>
          <div className="queue-list">
            {(state.reviewQueue || []).slice(0, 8).map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>{item.type} / {item.status}</small>
                {item.status === "pending" ? <div><button type="button" onClick={() => resolveItem(item.id, "approved")}>Approve</button><button type="button" onClick={() => resolveItem(item.id, "rejected")}>Reject</button></div> : null}
              </article>
            ))}
            {(state.reviewQueue || []).length === 0 ? <p>No pending review items yet.</p> : null}
          </div>
        </section>

        <section className="admin-card">
          <h2>API subscriptions</h2>
          <form onSubmit={handleCreateKey} className="stack-form">
            <label>Owner<input value={newKey.ownerName} onChange={(event) => setNewKey({ ...newKey, ownerName: event.target.value })} /></label>
            <label>Email<input value={newKey.ownerEmail} onChange={(event) => setNewKey({ ...newKey, ownerEmail: event.target.value })} /></label>
            <label>Plan<select value={newKey.planId} onChange={(event) => setNewKey({ ...newKey, planId: event.target.value })}>{apiPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <button type="submit"><KeyRound size={16} />Create API key</button>
          </form>
          {createdKey ? <p className="api-code">{createdKey}</p> : null}
          <div className="key-list">
            {(state.apiKeys || []).map((key) => <p key={key.id}>{key.ownerName} / {key.planName} / {key.tokenPreview}</p>)}
          </div>
        </section>

        <section className="admin-card">
          <h2>Worker status</h2>
          {(state.workerRuns || []).slice(0, 3).map((run) => <p key={run.id || run.startedAt}>{relativeTime(run.finishedAt)} / checked {run.results?.length || run.checked || 0}</p>)}
          {(state.workerRuns || []).length === 0 ? <p>No worker runs recorded yet.</p> : null}
          <h3>API endpoints</h3>
          <code>/api/v1/agents</code>
          <code>/api/v1/pricing</code>
          <code>/api/v1/model-pricing</code>
          <code>/api/v1/source-catalog</code>
          <code>/api/v1/categories</code>
        </section>
      </div>
      {message ? <p className="notice">{message}</p> : null}
    </main>
  );
}


const MAX_PRICING_PLANS = 5;

function cleanResearchRows(rows) {
  return (rows || [])
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]).filter(([, value]) => value !== "" && value !== null && value !== undefined)))
    .filter((row) => Object.keys(row).length > 0);
}


function hasResearchValue(row, keys) {
  return keys.some((key) => String(row?.[key] || "").trim());
}

function cleanPricingPlans(rows) {
  return cleanResearchRows(rows)
    .filter((row) => hasResearchValue(row, ["name", "price", "billingPeriod", "requestLimit", "rateLimit", "messageLimit", "tokenLimit", "limits"]))
    .slice(0, MAX_PRICING_PLANS);
}

function modelSupportDraft(agent) {
  const modelSupport = agent.modelSupport || {};
  const providers = Array.isArray(modelSupport.providers) ? modelSupport.providers.join(", ") : modelSupport.providers || "";
  return {
    providers,
    flexibility: modelSupport.flexibility || "",
    choice: modelSupport.choice || modelSupport.modelChoice || "",
    sourceUrl: modelSupport.sourceUrl || "",
    sourceLabel: modelSupport.sourceLabel || "",
    verifiedAt: modelSupport.verifiedAt || "",
  };
}

function cleanModelSupport(value) {
  const cleaned = cleanResearchObject(value);
  if (!Object.keys(cleaned).length) return null;
  if (cleaned.providers) cleaned.providers = String(cleaned.providers).split(",").map((item) => item.trim()).filter(Boolean);
  return cleaned;
}

function cleanBenchmarks(rows) {
  return cleanResearchRows(rows).filter((row) => hasResearchValue(row, ["benchmark", "score", "dataset"]));
}

function pricingPlanTemplateRows(agent) {
  const existingPlans = Array.isArray(agent.pricingPlans) ? agent.pricingPlans : [];
  if (existingPlans.length) return existingPlans;
  return [];
}
function cleanResearchObject(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, typeof item === "string" ? item.trim() : item]).filter(([, item]) => item !== "" && item !== null && item !== undefined));
}

function blankPricingPlan() {
  return { name: "", price: "", billingPeriod: "", requestLimit: "", rateLimit: "", messageLimit: "", tokenLimit: "", limits: "", sourceUrl: "", verifiedAt: "", notes: "" };
}

function blankBenchmark() {
  return { benchmark: "", score: "", dataset: "", sourceUrl: "", verifiedAt: "", notes: "" };
}

function researchVerifiedDate() {
  return new Date().toISOString().slice(0, 10);
}

function sourceUrlForResearch(agent, kind) {
  return sourceFor(agent, kind)?.url || "";
}

function withResearchDefaults(value, defaults) {
  return { ...defaults, ...(value || {}) };
}

function sourceBackedDraft(agent) {
  const verifiedAt = researchVerifiedDate();
  const pricingSourceUrl = sourceUrlForResearch(agent, "pricing");
  const benchmarkSourceUrl = sourceUrlForResearch(agent, "benchmarks");
  const statusSourceUrl = sourceUrlForResearch(agent, "status") || agent.operationalMetrics?.statusSourceUrl || "";
  const repoSourceUrl = agent.githubRepo ? `https://github.com/${agent.githubRepo}` : "";
  const primarySourceUrl = sourceUrlForResearch(agent, "primary") || agent.sourceUrl || agent.website || "";
  const packageRef = Array.isArray(agent.packages) ? agent.packages[0] : null;

  return {
    pricingPlans: pricingPlanTemplateRows(agent),
    modelSupport: modelSupportDraft(agent),
    benchmarks: agent.benchmarks?.length ? agent.benchmarks : [{ ...blankBenchmark(), sourceUrl: benchmarkSourceUrl, verifiedAt, notes: benchmarkSourceUrl ? "Use only benchmark rows that explicitly map to this agent or product." : "Add a benchmark source before entering scores." }],
    capabilityMetrics: withResearchDefaults(agent.capabilityMetrics, {
      contextSourceUrl: primarySourceUrl,
      verifiedAt,
    }),
    operationalMetrics: withResearchDefaults(agent.operationalMetrics, {
      sourceUrl: statusSourceUrl,
      verifiedAt,
    }),
    ecosystemHealth: withResearchDefaults(agent.ecosystemHealth, {
      sourceUrl: repoSourceUrl,
      verifiedAt,
    }),
    adoptionMetrics: withResearchDefaults(agent.adoptionMetrics, {
      sourceUrl: repoSourceUrl,
      verifiedAt,
    }),
    packageEcosystem: agent.packageEcosystem || packageRef?.ecosystem || "npm",
    packageName: agent.packageName || packageRef?.name || "",
    packageVersion: agent.packageVersion || packageRef?.version || "",
  };
}

function fillMissingResearchSources(current, agent) {
  const seeded = sourceBackedDraft(agent);
  const pricingSourceUrl = sourceUrlForResearch(agent, "pricing");
  return {
    pricingPlans: (current.pricingPlans || []).map((plan) => ({ ...plan, sourceUrl: plan.sourceUrl || pricingSourceUrl || "", verifiedAt: plan.verifiedAt || researchVerifiedDate() })),
    modelSupport: { ...seeded.modelSupport, ...(current.modelSupport || {}), sourceUrl: current.modelSupport?.sourceUrl || seeded.modelSupport.sourceUrl || sourceUrlForResearch(agent, "primary"), verifiedAt: current.modelSupport?.verifiedAt || seeded.modelSupport.verifiedAt || researchVerifiedDate() },
    benchmarks: (current.benchmarks?.length ? current.benchmarks : seeded.benchmarks).map((benchmark) => ({ ...benchmark, sourceUrl: benchmark.sourceUrl || seeded.benchmarks[0]?.sourceUrl || "", verifiedAt: benchmark.verifiedAt || researchVerifiedDate() })),
    capabilityMetrics: { ...seeded.capabilityMetrics, ...(current.capabilityMetrics || {}) },
    operationalMetrics: { ...seeded.operationalMetrics, ...(current.operationalMetrics || {}) },
    ecosystemHealth: { ...seeded.ecosystemHealth, ...(current.ecosystemHealth || {}) },
    adoptionMetrics: { ...seeded.adoptionMetrics, ...(current.adoptionMetrics || {}) },
  };
}
function ResearchInput({ label, value, onChange, placeholder = "" }) {
  return (
    <label>
      {label}
      <input value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ResearchAdminPage({ agents, navigate, reload, backendAvailable, initialSlug = "" }) {
  const [selectedSlug, setSelectedSlug] = useState(initialSlug || agents[0]?.slug || "");
  const selectedAgent = agents.find((agent) => agent.slug === selectedSlug) || agents[0] || null;
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedAgent) return;
    setSelectedSlug((current) => current || initialSlug || selectedAgent.slug);
    setDraft(sourceBackedDraft(selectedAgent));
    setMessage("");
  }, [selectedAgent?.slug, initialSlug]);

  function updateRow(group, index, key, value) {
    setDraft((current) => ({
      ...current,
      [group]: (current[group] || []).map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  }

  function addRow(group, row) {
    setDraft((current) => {
      const currentRows = current[group] || [];
      return { ...current, [group]: [...currentRows, row] };
    });
  }

  function removeRow(group, index, row) {
    setDraft((current) => {
      const nextRows = (current[group] || []).filter((_, rowIndex) => rowIndex !== index);
      if (group === "pricingPlans") return { ...current, [group]: nextRows };
      return { ...current, [group]: nextRows.length ? nextRows : [row] };
    });
  }

  function updateMetric(group, key, value) {
    setDraft((current) => ({ ...current, [group]: { ...(current[group] || {}), [key]: value } }));
  }

  function prefillSourceFields() {
    if (!selectedAgent) return;
    setDraft((current) => fillMissingResearchSources(current, selectedAgent));
    setMessage("Source fields prefilled. Review and enter only verified values before saving.");
  }

  async function saveResearch(event) {
    event.preventDefault();
    if (!selectedAgent) return;
    setMessage("");
    const payload = {
      pricingPlans: cleanPricingPlans(draft.pricingPlans),
      modelSupport: cleanModelSupport(draft.modelSupport),
      benchmarks: cleanBenchmarks(draft.benchmarks),
      capabilityMetrics: cleanResearchObject(draft.capabilityMetrics),
      operationalMetrics: cleanResearchObject(draft.operationalMetrics),
      ecosystemHealth: cleanResearchObject(draft.ecosystemHealth),
      adoptionMetrics: cleanResearchObject(draft.adoptionMetrics),
      packages: draft.packageName ? [{ ecosystem: draft.packageEcosystem, name: draft.packageName, version: draft.packageVersion || null }] : selectedAgent.packages || [],
      packageEcosystem: draft.packageEcosystem,
      packageName: draft.packageName,
      packageVersion: draft.packageVersion,
    };

    try {
      await updateAgent(selectedAgent.slug, payload);
      setMessage(`Verified research data saved for ${selectedAgent.name}.`);
      await reload();
    } catch (error) {
      setMessage(`Research data not saved: ${backendAvailable ? error.message : "backend is not running."}`);
    }
  }

  if (!selectedAgent) {
    return <main className="content admin-content"><section className="empty-state"><h1>No listings available</h1><button type="button" onClick={() => navigate("/admin")}>Back to admin</button></section></main>;
  }

  return (
    <main className="content admin-content research-admin">
      <button className="back-button" type="button" onClick={() => navigate("/admin")}>Back to admin</button>
      <section className="admin-editor">
        <div className="page-head">
          <div>
            <h1>Appurdex Research Admin</h1>
            <p>Populate source-backed pricing, benchmark, reliability, ecosystem, and adoption details.</p>
          </div>
          <div className="research-actions"><button type="button" onClick={prefillSourceFields}><RefreshCw size={16} />Prefill source fields</button></div>
        </div>

        <form className="editor-form research-form" onSubmit={saveResearch}>
          <label>
            Listing
            <select value={selectedAgent.slug} onChange={(event) => setSelectedSlug(event.target.value)}>
              {agents.map((agent, index) => <option key={(agent.slug || agent.id || agent.name) + "-research-option-" + index} value={agent.slug}>{agent.name}</option>)}
            </select>
          </label>

          <section className="research-section">
            <div className="research-section-head">
              <h2>Pricing Plans <span className="research-limit">up to 5 tiers</span></h2>
              <button type="button" disabled={(draft.pricingPlans || []).length >= MAX_PRICING_PLANS} onClick={() => addRow("pricingPlans", { ...blankPricingPlan(), sourceUrl: sourceUrlForResearch(selectedAgent, "pricing"), verifiedAt: researchVerifiedDate() })}>Add plan</button>
            </div>
            {(draft.pricingPlans || []).length ? null : <p className="notice">No pricing tiers added yet.</p>}
            {(draft.pricingPlans || []).map((plan, index) => (
              <article className="research-row" key={`pricing-${index}`}>
                <ResearchInput label="Plan name" value={plan.name} onChange={(value) => updateRow("pricingPlans", index, "name", value)} />
                <ResearchInput label="Price" value={plan.price} onChange={(value) => updateRow("pricingPlans", index, "price", value)} placeholder="$20" />
                <ResearchInput label="Billing period" value={plan.billingPeriod} onChange={(value) => updateRow("pricingPlans", index, "billingPeriod", value)} />
                <ResearchInput label="Request limit" value={plan.requestLimit || plan.rateLimit || ""} onChange={(value) => updateRow("pricingPlans", index, "requestLimit", value)} placeholder="requests/min, daily allowance, or N/A" />
                <ResearchInput label="Message limit" value={plan.messageLimit} onChange={(value) => updateRow("pricingPlans", index, "messageLimit", value)} placeholder="messages/day or monthly allowance" />
                <ResearchInput label="Token limit" value={plan.tokenLimit} onChange={(value) => updateRow("pricingPlans", index, "tokenLimit", value)} placeholder="tokens/day, context cap, or N/A" />
                <ResearchInput label="Other limits" value={plan.limits} onChange={(value) => updateRow("pricingPlans", index, "limits", value)} />
                <ResearchInput label="Source URL" value={plan.sourceUrl} onChange={(value) => updateRow("pricingPlans", index, "sourceUrl", value)} />
                <ResearchInput label="Verified at" value={plan.verifiedAt} onChange={(value) => updateRow("pricingPlans", index, "verifiedAt", value)} placeholder="2026-07-03" />
                <ResearchInput label="Notes" value={plan.notes} onChange={(value) => updateRow("pricingPlans", index, "notes", value)} />
                <button type="button" onClick={() => removeRow("pricingPlans", index, blankPricingPlan())}>Remove</button>
              </article>
            ))}
          </section>

          <section className="research-section">
            <div className="research-section-head">
              <h2>Benchmarks</h2>
              <button type="button" onClick={() => addRow("benchmarks", blankBenchmark())}>Add benchmark</button>
            </div>
            {(draft.benchmarks || [blankBenchmark()]).map((benchmark, index) => (
              <article className="research-row" key={`benchmark-${index}`}>
                <ResearchInput label="Benchmark" value={benchmark.benchmark} onChange={(value) => updateRow("benchmarks", index, "benchmark", value)} placeholder="SWE-bench Verified" />
                <ResearchInput label="Score" value={benchmark.score} onChange={(value) => updateRow("benchmarks", index, "score", value)} />
                <ResearchInput label="Dataset / split" value={benchmark.dataset} onChange={(value) => updateRow("benchmarks", index, "dataset", value)} />
                <ResearchInput label="Source URL" value={benchmark.sourceUrl} onChange={(value) => updateRow("benchmarks", index, "sourceUrl", value)} />
                <ResearchInput label="Verified at" value={benchmark.verifiedAt} onChange={(value) => updateRow("benchmarks", index, "verifiedAt", value)} placeholder="2026-07-03" />
                <ResearchInput label="Notes" value={benchmark.notes} onChange={(value) => updateRow("benchmarks", index, "notes", value)} />
                <button type="button" onClick={() => removeRow("benchmarks", index, blankBenchmark())}>Remove</button>
              </article>
            ))}
          </section>

          <section className="research-section metrics-grid">
            <h2>Model Support</h2>
            <ResearchInput label="Model providers" value={draft.modelSupport?.providers} onChange={(value) => updateMetric("modelSupport", "providers", value)} placeholder="Anthropic, OpenAI, Google" />
            <ResearchInput label="Flexibility" value={draft.modelSupport?.flexibility} onChange={(value) => updateMetric("modelSupport", "flexibility", value)} placeholder="Provider-locked / Multi-model / Single-model" />
            <ResearchInput label="Model choice" value={draft.modelSupport?.choice} onChange={(value) => updateMetric("modelSupport", "choice", value)} placeholder="User configurable, vendor default, or named model family" />
            <ResearchInput label="Source URL" value={draft.modelSupport?.sourceUrl} onChange={(value) => updateMetric("modelSupport", "sourceUrl", value)} />
            <ResearchInput label="Source label" value={draft.modelSupport?.sourceLabel} onChange={(value) => updateMetric("modelSupport", "sourceLabel", value)} />
            <ResearchInput label="Verified at" value={draft.modelSupport?.verifiedAt} onChange={(value) => updateMetric("modelSupport", "verifiedAt", value)} placeholder="2026-07-03" />
          </section>

          <section className="research-section metrics-grid">
            <h2>Capability Metrics</h2>
            <ResearchInput label="Context source URL" value={draft.capabilityMetrics?.contextSourceUrl} onChange={(value) => updateMetric("capabilityMetrics", "contextSourceUrl", value)} />
            <ResearchInput label="Verified at" value={draft.capabilityMetrics?.verifiedAt} onChange={(value) => updateMetric("capabilityMetrics", "verifiedAt", value)} />
          </section>

          <section className="research-section metrics-grid">
            <h2>Operational Metrics</h2>
            <ResearchInput label="7-day uptime" value={draft.operationalMetrics?.uptime7d} onChange={(value) => updateMetric("operationalMetrics", "uptime7d", value)} />
            <ResearchInput label="Average latency" value={draft.operationalMetrics?.avgLatency} onChange={(value) => updateMetric("operationalMetrics", "avgLatency", value)} />
            <ResearchInput label="Time to first token" value={draft.operationalMetrics?.timeToFirstToken} onChange={(value) => updateMetric("operationalMetrics", "timeToFirstToken", value)} />
            <ResearchInput label="Current status" value={draft.operationalMetrics?.currentStatus} onChange={(value) => updateMetric("operationalMetrics", "currentStatus", value)} />
            <ResearchInput label="Active incidents" value={draft.operationalMetrics?.activeIncidentCount} onChange={(value) => updateMetric("operationalMetrics", "activeIncidentCount", value)} />
            <ResearchInput label="Operational components" value={draft.operationalMetrics?.operationalComponentCount} onChange={(value) => updateMetric("operationalMetrics", "operationalComponentCount", value)} />
            <ResearchInput label="Total components" value={draft.operationalMetrics?.componentCount} onChange={(value) => updateMetric("operationalMetrics", "componentCount", value)} />
            <ResearchInput label="Metric source URL" value={draft.operationalMetrics?.sourceUrl} onChange={(value) => updateMetric("operationalMetrics", "sourceUrl", value)} />
            <ResearchInput label="Verified at" value={draft.operationalMetrics?.verifiedAt} onChange={(value) => updateMetric("operationalMetrics", "verifiedAt", value)} />
          </section>

          <section className="research-section metrics-grid">
            <h2>Ecosystem Health</h2>
            <ResearchInput label="Issue resolution velocity" value={draft.ecosystemHealth?.issueResolutionVelocity} onChange={(value) => updateMetric("ecosystemHealth", "issueResolutionVelocity", value)} />
            <ResearchInput label="Dependency count" value={draft.ecosystemHealth?.dependencyCount} onChange={(value) => updateMetric("ecosystemHealth", "dependencyCount", value)} />
            <ResearchInput label="Vulnerability score" value={draft.ecosystemHealth?.vulnerabilityScore} onChange={(value) => updateMetric("ecosystemHealth", "vulnerabilityScore", value)} />
            <ResearchInput label="Known vulnerability count" value={draft.ecosystemHealth?.vulnerabilityCount} onChange={(value) => updateMetric("ecosystemHealth", "vulnerabilityCount", value)} />
            <ResearchInput label="Metric source URL" value={draft.ecosystemHealth?.sourceUrl} onChange={(value) => updateMetric("ecosystemHealth", "sourceUrl", value)} />
            <ResearchInput label="Verified at" value={draft.ecosystemHealth?.verifiedAt} onChange={(value) => updateMetric("ecosystemHealth", "verifiedAt", value)} />
          </section>

          <section className="research-section metrics-grid">
            <h2>Package Lookup</h2>
            <ResearchInput label="Package ecosystem" value={draft.packageEcosystem} onChange={(value) => setDraft((current) => ({ ...current, packageEcosystem: value }))} placeholder="npm / pypi" />
            <ResearchInput label="Package name" value={draft.packageName} onChange={(value) => setDraft((current) => ({ ...current, packageName: value }))} placeholder="@scope/pkg or aider-chat" />
            <ResearchInput label="Package version" value={draft.packageVersion} onChange={(value) => setDraft((current) => ({ ...current, packageVersion: value }))} placeholder="optional" />
          </section>

          <section className="research-section metrics-grid">
            <h2>Market & Adoption Momentum</h2>
            <ResearchInput label="Package name" value={draft.adoptionMetrics?.packageName} onChange={(value) => updateMetric("adoptionMetrics", "packageName", value)} />
            <ResearchInput label="Package ecosystem" value={draft.adoptionMetrics?.packageEcosystem} onChange={(value) => updateMetric("adoptionMetrics", "packageEcosystem", value)} placeholder="npm / PyPI / Docker" />
            <ResearchInput label="Monthly downloads" value={draft.adoptionMetrics?.packageDownloadsMonthly} onChange={(value) => updateMetric("adoptionMetrics", "packageDownloadsMonthly", value)} />
            <ResearchInput label="Download velocity" value={draft.adoptionMetrics?.packageDownloadVelocity} onChange={(value) => updateMetric("adoptionMetrics", "packageDownloadVelocity", value)} />
            <ResearchInput label="Metric source URL" value={draft.adoptionMetrics?.sourceUrl} onChange={(value) => updateMetric("adoptionMetrics", "sourceUrl", value)} />
            <ResearchInput label="Verified at" value={draft.adoptionMetrics?.verifiedAt} onChange={(value) => updateMetric("adoptionMetrics", "verifiedAt", value)} />
          </section>

          <div className="research-actions">
            <button type="submit"><CheckCircle2 size={16} />Save research data</button>
            <button type="button" onClick={() => navigate(selectedAgent.publicPath)}>View public page</button>
          </div>
        </form>
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
  );
}
function AdminAgentEditor({ agent, navigate, reload, backendAvailable }) {
  const [draft, setDraft] = useState(agent || {});
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(agent || {});
  }, [agent?.slug]);

  if (!agent) {
    return (
      <main className="content"><section className="empty-state"><h1>Admin record not found</h1><button type="button" onClick={() => navigate("/admin")}>Back to admin</button></section></main>
    );
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      await updateAgent(agent.slug, draft);
      setMessage("Listing record updated.");
      await reload();
    } catch (error) {
      setMessage(`Not saved: ${backendAvailable ? error.message : "backend is not running."}`);
    }
  }

  return (
    <>
    <main className="content admin-content">
      <button className="back-button" type="button" onClick={() => navigate("/admin")}>Back to admin</button>
      <section className="admin-editor">
        <div className="page-head">
          <div>
            <h1>Edit {agent.name}</h1>
            <p>Admin URL: {agent.adminPath}. Public URL: {agent.publicPath}.</p>
          </div>
        </div>
        <form className="editor-form" onSubmit={save}>
          <label>Category<input value={draft.category || ""} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
          <label>Pricing tier<input value={draft.pricingTier || ""} onChange={(event) => setDraft({ ...draft, pricingTier: event.target.value })} /></label>
          <label>Website<input value={draft.website || ""} onChange={(event) => setDraft({ ...draft, website: event.target.value })} /></label>
          <label>Source URL<input value={draft.sourceUrl || ""} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} /></label>
          <label>Source label<input value={draft.sourceLabel || ""} onChange={(event) => setDraft({ ...draft, sourceLabel: event.target.value })} /></label>
          <label>Pricing URL<input value={draft.pricingUrl || ''} onChange={(event) => setDraft({ ...draft, pricingUrl: event.target.value })} /></label>
          <label>Pricing label<input value={draft.pricingLabel || ''} onChange={(event) => setDraft({ ...draft, pricingLabel: event.target.value })} /></label>
          <label>Status page URL<input value={draft.statusPageUrl || ''} onChange={(event) => setDraft({ ...draft, statusPageUrl: event.target.value })} /></label>
          <label>Status page label<input value={draft.statusPageLabel || ''} onChange={(event) => setDraft({ ...draft, statusPageLabel: event.target.value })} /></label>
          <label>Benchmark URL<input value={draft.benchmarkUrl || ''} onChange={(event) => setDraft({ ...draft, benchmarkUrl: event.target.value })} /></label>
          <label>Benchmark label<input value={draft.benchmarkLabel || ''} onChange={(event) => setDraft({ ...draft, benchmarkLabel: event.target.value })} /></label>
          <label>Description<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Status note<textarea value={draft.statusNote || ""} onChange={(event) => setDraft({ ...draft, statusNote: event.target.value })} /></label>
          <div className="research-actions"><button type="button" onClick={() => navigate(`/admin/research/${agent.slug}`)}><FileText size={16} />Open Research Admin</button><button type="submit"><CheckCircle2 size={16} />Save verified record</button></div>
        </form>
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
    <ResearchAdminPage agents={[agent]} backendAvailable={backendAvailable} navigate={navigate} reload={reload} initialSlug={agent.slug} />
    </>
  );
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [state, setState] = useState(() => buildStaticState(trackedTools));
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [viewer, setViewer] = useState({ user: null, access: {}, limits: { plan: "free" }, config: {} });
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem("appurdex-theme");
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const route = getRoute(path);
  const language = languageFromPath(path);

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { applyDocumentLogo(); }, []);
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
  useEffect(() => { scrollRouteToTop(); }, [path]);
  useEffect(() => { trackPageView(path); }, [path]);
  useEffect(() => { trackSearch(filters.query); }, [filters.query]);
  useEffect(() => { trackEvent("filter_used", { category: filters.category, priceBudget: filters.priceBudget, access: filters.access, useCase: filters.useCase, modelFlex: filters.modelFlex, publicRepo: filters.publicRepo, sortBy: filters.sortBy }); }, [filters.category, filters.priceBudget, filters.access, filters.useCase, filters.modelFlex, filters.publicRepo, filters.sortBy]);

  const reloadViewer = async () => {
    try {
      setViewer(await getViewer());
    } catch {
      setViewer({ user: null, access: {}, limits: { plan: "free" }, config: {} });
    }
  };

  const reload = async () => {
    try {
      const result = route.section === "admin" ? await getAdminState() : await getPublicAgents();
      const seededState = buildStaticState(trackedTools);
      setState((current) => ({ ...current, ...seededState, ...result, agents: mergeAgentCatalog(seededState.agents, result.agents || []) }));
      setBackendAvailable(true);
    } catch {
      setState(buildStaticState(trackedTools));
      setBackendAvailable(false);
    }
  };

  useEffect(() => {
    reload();
  }, [route.section]);

  useEffect(() => {
    reloadViewer();
  }, []);

  useEffect(() => {
    if (path === "/en") {
      window.history.replaceState(null, "", "/");
      setPath("/");
    }
  }, [path]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);


  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("appurdex-theme", theme);
  }, [theme]);

  const agents = useMemo(() => {
    const sourceChecks = state.sourceChecks || {};
    const githubMetrics = state.githubMetrics || {};
    return sortAgents((state.agents || []).map((agent) => normalizeAgent(agent, sourceChecks[agent.slug || agent.id], githubMetrics[agent.slug || agent.id])));
  }, [state]);

  function navigate(nextPath) {
    if (nextPath.startsWith("http") || nextPath.includes(".")) {
      window.location.href = nextPath;
      return;
    }
    const targetPath = cleanPath(nextPath);
    if (targetPath === cleanPath(window.location.pathname)) {
      scrollRouteToTop();
      return;
    }
    window.history.pushState(null, "", targetPath);
    setPath(window.location.pathname);
    scrollRouteToTop();
  }

  function handleAppFrameClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !isInternalAppRoute(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }


  const selectedAgent = agents.find((agent) => agent.slug === route.slug || agent.id === route.slug);
  const vendorRows = useMemo(() => buildVendorRows(agents), [agents]);
  const selectedVendor = vendorRows.find((vendor) => vendor.id === (route.vendorSlug || route.slug)) || null;
  const initialCompareSlugs = route.page === "compare" ? (new URLSearchParams(window.location.search).get("agents") || "").split(",").map((slug) => slug.trim()).filter(Boolean).slice(0, 5) : [];

  useEffect(() => {
    if (route.section !== "public" || route.page !== "agent-detail" || !selectedAgent?.publicPath) return;
    const currentPath = cleanPath(path);
    if (currentPath !== selectedAgent.publicPath) {
      window.history.replaceState(null, "", selectedAgent.publicPath);
      setPath(window.location.pathname);
    }
  }, [path, route.section, route.page, selectedAgent?.publicPath]);

  useEffect(() => {
    if (route.slug && selectedAgent?.slug) trackEvent("agent_viewed", { agent: selectedAgent.slug });
  }, [route.slug, selectedAgent?.slug]);

  return (
    <div className="app-frame" data-language={language} data-theme={theme} onClick={handleAppFrameClick}>
      <Sidebar navigate={navigate} path={path} />
      <section className="main-shell">
        <Topbar agents={agents} vendors={vendorRows} modelPricing={state.modelPricing || []} navigate={navigate} setFilters={setFilters} theme={theme} toggleTheme={toggleTheme} viewer={viewer} backendAvailable={backendAvailable} reloadViewer={reloadViewer} />
        {route.section === "admin" && route.slug ? (
          <AdminAgentEditor agent={selectedAgent} backendAvailable={backendAvailable} navigate={navigate} reload={reload} />
        ) : route.section === "admin" ? (
          <AdminDashboard state={state} agents={agents} backendAvailable={backendAvailable} navigate={navigate} reload={reload} />
        ) : route.page === "compare" ? (
          <ComparePage agents={agents} navigate={navigate} viewer={viewer} initialSlugs={initialCompareSlugs} snapshots={state.metricSnapshots || []} modelPricing={state.modelPricing || []} />
        ) : route.page === "research" ? (
          <ResearchPage navigate={navigate} />
        ) : route.page === "request-form" ? (
          <RequestUpdatePage agents={agents} navigate={navigate} />
        ) : route.page === "learn" ? (
          <LearnPage navigate={navigate} />
        ) : route.page === "analytics" ? (
          <AgentPerformanceAnalyticsPage agents={agents} state={state} backendAvailable={backendAvailable} navigate={navigate} />
        ) : route.page === "alerts" ? (
          <AlertsPage state={state} viewer={viewer} navigate={navigate} />
        ) : route.page === "saved" ? (
          <SavedPage agents={agents} viewer={viewer} navigate={navigate} />
        ) : route.page === "assistant" ? (
          <AppurdexAiPage backendAvailable={backendAvailable} viewer={viewer} />
        ) : route.page === "api" ? (
          <ApiPage state={state} backendAvailable={backendAvailable} navigate={navigate} viewer={viewer} reloadViewer={reloadViewer} />
        ) : route.page === "settings" ? (
          <PlaceholderPage title="Settings" navigate={navigate}>Public settings are not available yet.</PlaceholderPage>
        ) : route.page === "vendors" ? (
          <VendorOverviewPage agents={agents} navigate={navigate} />
        ) : route.page === "vendor-detail" ? (
          <VendorEcosystemPage vendor={selectedVendor} navigate={navigate} />
        ) : route.page === "use-cases" ? (
          <UseCasesIndexPage agents={agents} navigate={navigate} />
        ) : route.page === "use-case-detail" ? (
          <UseCaseDetailPage agents={agents} navigate={navigate} slug={route.slug} />
        ) : route.page === "ai" ? (
          <DirectoryPage agents={agents} backendAvailable={backendAvailable} filters={filters} navigate={navigate} setFilters={setFilters} title="AI Directory" description="Source-backed AI products matched by agent, repo, category, and use-case search." />
        ) : route.slug ? (
          <AgentDetailPage agent={selectedAgent} navigate={navigate} modelPricing={state.modelPricing || []} />
        ) : route.page === "agents" ? (
          <DirectoryPage agents={agents} backendAvailable={backendAvailable} filters={filters} navigate={navigate} setFilters={setFilters} title="AI Agents" description="Agent-only view for coding agents, IDE assistants, CLI agents, and autonomous cloud agents." scopeEcosystem="Agents" />
        ) : (
          <VendorOverviewPage agents={agents} navigate={navigate} />
        )}
        <footer className="bottom-footer">
          <nav><button type="button" onClick={() => navigate("/")}>Overview</button><a href="/docs/data-sourcing.md">Data policy</a><a>Privacy</a><a>Terms</a></nav>
          <span><Bell size={14} />Report an issue</span>
        </footer>
      </section>
    </div>
  );
}

