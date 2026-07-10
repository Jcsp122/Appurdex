import crypto from "node:crypto";
import fsSync from "node:fs";
import { readDb, writeDb, makeReviewItem } from "./store.mjs";
import { MODEL_PRICING_SYNC_INTERVAL_MS, modelPricingSources } from "../src/data/modelPricing.js";
import { applyFreshnessToDb, inferSyncTier, nextSyncAt, normalizeSyncTier } from "./freshness.mjs";
import { getSyncStates, upsertSyncState } from "./customer-store.mjs";
import { syncOfficialModelCatalog } from "./model-catalog-sync.mjs";

function now() {
  return new Date().toISOString();
}

function loadLocalEnv(filePath = ".env.local") {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadLocalEnv();


async function githubError(response) {
  const body = await response.text().catch(() => "");
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.documentation_url || body;
  } catch {
    message = body;
  }
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  const resource = response.headers.get("x-ratelimit-resource");
  const rate = remaining === null ? "" : `; rate remaining ${remaining}${reset ? ` reset ${new Date(Number(reset) * 1000).toISOString()}` : ""}${resource ? ` resource ${resource}` : ""}`;
  return `GitHub returned ${response.status}${message ? `: ${message}` : ""}${rate}`;
}
function totalFromLinkHeader(linkHeader) {
  if (!linkHeader) return null;
  const lastLink = linkHeader.split(",").find((part) => part.includes('rel="last"'));
  const match = lastLink?.match(/[?&]page=(\d+)/);
  return match ? Number(match[1]) : null;
}

async function countGithubList(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) return { count: null, error: await githubError(response) };
  const total = totalFromLinkHeader(response.headers.get("link"));
  if (typeof total === "number") return { count: total, error: null };
  const items = await response.json();
  return { count: Array.isArray(items) ? items.length : null, error: null };
}

async function fetchGithubContributorCount(agent, headers, repo) {
  const sourceUrl = repo.html_url + "/graphs/contributors";
  try {
    const result = await countGithubList("https://api.github.com/repos/" + agent.githubRepo + "/contributors?per_page=1&anon=true", headers);
    return { ...result, sourceUrl };
  } catch (error) {
    return { count: null, error: error.message, sourceUrl };
  }
}

async function fetchGithubCommitCount(agent, headers, days) {
  const sourceUrl = "https://github.com/" + agent.githubRepo + "/commits";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await countGithubList("https://api.github.com/repos/" + agent.githubRepo + "/commits?since=" + encodeURIComponent(since) + "&per_page=1", headers);
    return { ...result, sourceUrl };
  } catch (error) {
    return { count: null, error: error.message, sourceUrl };
  }
}

async function fetchGithubReleaseMetrics(agent, headers, repo) {
  const sourceUrl = repo.html_url + "/releases";
  try {
    const response = await fetch("https://api.github.com/repos/" + agent.githubRepo + "/releases?per_page=10", { headers });
    if (!response.ok) return { count: null, latestReleaseDate: null, releaseCadenceDays: null, error: await githubError(response), sourceUrl };
    const releases = await response.json();
    const dates = (Array.isArray(releases) ? releases : [])
      .map((release) => release.published_at || release.created_at)
      .filter(Boolean)
      .map((date) => new Date(date).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a);
    const gaps = dates.slice(0, -1).map((date, index) => Math.round((date - dates[index + 1]) / 86400000));
    return {
      count: Array.isArray(releases) ? releases.length : null,
      latestReleaseDate: dates[0] ? new Date(dates[0]).toISOString() : null,
      releaseCadenceDays: gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null,
      error: null,
      sourceUrl,
    };
  } catch (error) {
    return { count: null, latestReleaseDate: null, releaseCadenceDays: null, error: error.message, sourceUrl };
  }
}

async function fetchGithubMetric(agent) {
  if (!agent.githubRepo) return null;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AppurdexResearchWorker/0.1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;

  const response = await fetch("https://api.github.com/repos/" + agent.githubRepo, { headers });
  if (!response.ok) {
    return { ok: false, status: response.status, error: await githubError(response), lastVerifiedAt: now(), sourceUrl: "https://github.com/" + agent.githubRepo };
  }
  const repo = await response.json();
  const [contributors, releases, commits30d] = await Promise.all([
    fetchGithubContributorCount(agent, headers, repo),
    fetchGithubReleaseMetrics(agent, headers, repo),
    fetchGithubCommitCount(agent, headers, 30),
  ]);
  return {
    ok: true,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    lastCommitDate: repo.pushed_at,
    license: repo.license?.spdx_id || null,
    defaultBranch: repo.default_branch || null,
    sourceUrl: repo.html_url,
    homepage: repo.homepage || null,
    lastVerifiedAt: now(),
    contributorCount: contributors.count,
    contributorCountError: contributors.error || null,
    contributorSourceUrl: contributors.sourceUrl,
    commitCount30d: commits30d.count,
    commitCount30dError: commits30d.error || null,
    commitActivitySourceUrl: commits30d.sourceUrl,
    releaseCount: releases.count,
    latestReleaseDate: releases.latestReleaseDate,
    releaseCadenceDays: releases.releaseCadenceDays,
    releaseCadenceError: releases.error || null,
    releaseSourceUrl: releases.sourceUrl,
  };
}

function configuredPackages(agent) {
  const refs = [
    ...(Array.isArray(agent.packages) ? agent.packages : []),
    agent.packageName ? { ecosystem: agent.packageEcosystem, name: agent.packageName, version: agent.packageVersion } : null,
    agent.adoptionMetrics?.packageName ? { ecosystem: agent.adoptionMetrics.packageEcosystem, name: agent.adoptionMetrics.packageName } : null,
  ].filter((item) => item?.name);
  const seen = new Set();
  return refs.filter((item) => {
    const ecosystem = String(item.ecosystem || "npm").toLowerCase();
    const key = ecosystem + "::" + String(item.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item) => ({ ...item, ecosystem: String(item.ecosystem || "npm").toLowerCase() }));
}

async function fetchNpmDownloads(name) {
  const sourceUrl = "https://api.npmjs.org/downloads/point/last-month/" + encodeURIComponent(name);
  try {
    const response = await fetch(sourceUrl, { headers: { "User-Agent": "AppurdexResearchWorker/0.1" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, ecosystem: "npm", name, sourceUrl, error: body.error || "npm downloads API returned " + response.status };
    return { ok: true, ecosystem: "npm", name, downloadsLastMonth: body.downloads ?? null, start: body.start || null, end: body.end || null, sourceUrl };
  } catch (error) {
    return { ok: false, ecosystem: "npm", name, sourceUrl, error: error.message };
  }
}

async function fetchPackageMetric(agent) {
  const refs = configuredPackages(agent);
  if (!refs.length) return null;
  const results = [];
  for (const ref of refs) {
    if (ref.ecosystem === "npm") {
      results.push(await fetchNpmDownloads(ref.name));
    } else if (["pypi", "python"].includes(ref.ecosystem)) {
      results.push({ ok: false, ecosystem: "pypi", name: ref.name, sourceUrl: "https://pypi.org/project/" + encodeURIComponent(ref.name) + "/", error: "PyPI does not provide an official first-party package download-count API." });
    } else {
      results.push({ ok: false, ecosystem: ref.ecosystem, name: ref.name, sourceUrl: null, error: "Package download source is not configured for this ecosystem." });
    }
  }
  const successful = results.filter((item) => item.ok && typeof item.downloadsLastMonth === "number");
  const downloadsLastMonth = successful.reduce((sum, item) => sum + item.downloadsLastMonth, 0);
  return {
    ok: successful.length > 0,
    downloadsLastMonth: successful.length ? downloadsLastMonth : null,
    checkedAt: now(),
    sources: results,
    packageDownloadError: results.filter((item) => !item.ok).map((item) => item.name + ": " + item.error).join("; ") || null,
  };
}

function applyPackageMetric(agent, packageMetric) {
  if (!packageMetric) return;
  agent.adoptionMetrics = { ...(agent.adoptionMetrics || {}) };
  if (typeof packageMetric.downloadsLastMonth === "number") {
    agent.adoptionMetrics.packageDownloadsMonthly = packageMetric.downloadsLastMonth;
    agent.adoptionMetrics.packageDownloadVelocity = packageMetric.downloadsLastMonth;
    agent.adoptionMetrics.packageDownloadCheckedAt = packageMetric.checkedAt;
    agent.adoptionMetrics.packageDownloadSourceUrl = packageMetric.sources.find((item) => item.ok)?.sourceUrl || null;
    agent.adoptionMetrics.packageDownloadSources = packageMetric.sources;
  }
  if (packageMetric.packageDownloadError) agent.adoptionMetrics.packageDownloadError = packageMetric.packageDownloadError;
}

function derivedGithubHealth(githubMetric) {
  if (!githubMetric?.ok) return {};
  const stars = githubMetric.stars;
  const forks = githubMetric.forks;
  const forkStarRatio = typeof forks === "number" && typeof stars === "number" && stars > 0 ? Number((forks / stars).toFixed(4)) : null;
  const lastPushAgeDays = githubMetric.lastCommitDate ? Math.max(0, Math.round((Date.now() - new Date(githubMetric.lastCommitDate).getTime()) / 86400000)) : null;
  return {
    repoStars: stars,
    repoForks: forks,
    repoOpenIssues: githubMetric.openIssues,
    repoForkStarRatio: forkStarRatio,
    repoLastPushAgeDays: lastPushAgeDays,
    repoLastCommitDate: githubMetric.lastCommitDate,
    repoSourceUrl: githubMetric.sourceUrl,
    repoMetricsCheckedAt: githubMetric.lastVerifiedAt,
    repoLicense: githubMetric.license,
    issueResolutionVelocity: githubMetric.issueResolutionVelocity,
    issueResolutionVelocityDaysMedian: githubMetric.issueResolutionVelocityDaysMedian,
    issueResolutionSampleSize: githubMetric.issueResolutionSampleSize,
    issueResolutionSourceUrl: githubMetric.issueResolutionSourceUrl,
    issueResolutionCheckedAt: githubMetric.issueResolutionCheckedAt,
    issueResolutionError: githubMetric.issueResolutionError,
  };
}
function upsertReviewItem(db, item) {
  const exists = db.reviewQueue.some((current) => current.status === "pending" && current.type === item.type && current.agentSlug === item.agentSlug && current.sourceUrl === item.sourceUrl);
  if (!exists) db.reviewQueue.unshift(item);
}

function sourceCheckDue(check) {
  if (!check?.next_sync_at) return true;
  const dueAt = new Date(check.next_sync_at).getTime();
  return !Number.isFinite(dueAt) || dueAt <= Date.now();
}

function sourceHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function syncModelPricingSources(db) {
  db.modelPricingSourceChecks = db.modelPricingSourceChecks || {};
  const results = await syncOfficialModelCatalog(db);

  for (const source of modelPricingSources) {
    if (["OpenAI", "Anthropic", "Google"].includes(source.provider)) continue;
    const previous = db.modelPricingSourceChecks[source.id] || null;
    if (!sourceCheckDue(previous)) continue;

    const checkedAt = now();
    try {
      const response = await fetch(source.sourceUrl, {
        headers: { "User-Agent": "AppurdexResearchWorker/0.1" },
      });
      const body = await response.text();
      const contentHash = sourceHash(body);
      const changed = Boolean(previous?.content_hash && previous.content_hash !== contentHash);
      const check = {
        sourceId: source.id,
        provider: source.provider,
        status: response.ok ? "ok" : "error",
        httpStatus: response.status,
        sourceUrl: source.sourceUrl,
        etag: response.headers.get("etag") || null,
        content_hash: contentHash,
        last_synced_at: checkedAt,
        next_sync_at: new Date(Date.now() + MODEL_PRICING_SYNC_INTERVAL_MS).toISOString(),
        changed,
        error: response.ok ? null : `Pricing source returned HTTP ${response.status}`,
      };
      db.modelPricingSourceChecks[source.id] = check;
      if (changed) {
        upsertReviewItem(db, makeReviewItem(
          "model_pricing_source_changed",
          "model-pricing",
          `${source.provider} model pricing source changed`,
          "Official model pricing page content changed. Review token pricing rows before publishing updates.",
          source.sourceUrl,
        ));
      }
      results.push(check);
    } catch (error) {
      const check = {
        sourceId: source.id,
        provider: source.provider,
        status: "error",
        sourceUrl: source.sourceUrl,
        last_synced_at: checkedAt,
        next_sync_at: new Date(Date.now() + MODEL_PRICING_SYNC_INTERVAL_MS).toISOString(),
        changed: false,
        error: error.message,
      };
      db.modelPricingSourceChecks[source.id] = check;
      upsertReviewItem(db, makeReviewItem(
        "model_pricing_source_check_failed",
        "model-pricing",
        `${source.provider} model pricing source check failed`,
        error.message,
        source.sourceUrl,
      ));
      results.push(check);
    }
  }

  return results;
}


function previousSnapshot(db, agentSlug, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (db.metricSnapshots || [])
    .filter((snapshot) => snapshot.agentSlug === agentSlug && snapshot.github?.ok && typeof snapshot.github.stars === "number")
    .filter((snapshot) => new Date(snapshot.checkedAt).getTime() <= cutoff)
    .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0] || null;
}

function percentChange(current, previous) {
  if (typeof current !== "number" || typeof previous !== "number" || previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function addSnapshotTrends(db, slug, metric) {
  const previous7d = previousSnapshot(db, slug, 7);
  const previous30d = previousSnapshot(db, slug, 30);
  return {
    ...metric,
    trend7dPct: percentChange(metric.stars, previous7d?.github?.stars),
    trend30dPct: percentChange(metric.stars, previous30d?.github?.stars),
    trend7dBaselineAt: previous7d?.checkedAt || null,
    trend30dBaselineAt: previous30d?.checkedAt || null,
  };
}

function appendMetricSnapshot(db, snapshot) {
  db.metricSnapshots = Array.isArray(db.metricSnapshots) ? db.metricSnapshots : [];
  db.metricSnapshots.unshift({ id: crypto.randomUUID(), checkedAt: now(), ...snapshot });
  const limit = Number(process.env.APPURDEX_METRIC_SNAPSHOT_LIMIT || 5000);
  db.metricSnapshots = db.metricSnapshots.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5000);
}

function deriveObservedUptime(db, agentSlug) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const samples = (db.metricSnapshots || [])
    .filter((snapshot) => snapshot.agentSlug === agentSlug && snapshot.status?.statusFetchOk === true)
    .filter((snapshot) => new Date(snapshot.checkedAt).getTime() >= cutoff);
  if (!samples.length) return {};
  const healthy = samples.filter((snapshot) => {
    const status = snapshot.status || {};
    return status.currentStatus === "none" && Number(status.activeIncidentCount || 0) === 0;
  }).length;
  const pct = Number(((healthy / samples.length) * 100).toFixed(2));
  return {
    uptime7d: `${pct}% of ${samples.length} worker checks`,
    uptime7dObservedPct: pct,
    uptime7dSampleCount: samples.length,
    uptime7dWindow: "7d_worker_observed",
  };
}

function logAutomationGaps(db, agent, slug, statusMetric, packageMetric) {
  const packageRefs = configuredPackages(agent);
  const gaps = [];
  if (!agent.githubRepo) gaps.push(["github_repo", "No GitHub repo configured; repo stars, forks, issues, and update cadence cannot be populated automatically."]);
  if (!agent.sourceUrls?.some((item) => item.kind === "status" && item.url)) gaps.push(["status_feed", "No public status feed configured; uptime and component health cannot be populated automatically."]);
  if (!packageRefs.length) gaps.push(["package_lookup", "No npm/PyPI package identifier configured; downloads, dependency count, and OSV vulnerability metrics cannot be populated automatically."]);
  if (!agent.pricingUrl && !agent.sourceUrls?.some((item) => item.kind === "pricing" && item.url)) gaps.push(["pricing_source", "No official pricing source URL configured. Pricing plans require an official source or vendor feed; scraping remains disabled."]);
  if (!Array.isArray(agent.benchmarks) || agent.benchmarks.length === 0) gaps.push(["benchmark_mapping", "No verified benchmark row is mapped to this listing. The worker will not infer product scores from unrelated model scores."]);
  if (statusMetric?.statusFetchOk === false) gaps.push(["status_fetch", statusMetric.statusFetchError || "Configured status feed failed."]);
  if (packageMetric?.packageDownloadError) gaps.push(["package_download", `Package download fetch failed: ${packageMetric.packageDownloadError}`]);
  if (packageMetric?.depsDevError) gaps.push(["dependency_lookup", `deps.dev fetch failed: ${packageMetric.depsDevError}`]);
  if (packageMetric?.osvError) gaps.push(["vulnerability_lookup", `OSV fetch failed: ${packageMetric.osvError}`]);

  for (const [field, detail] of gaps) {
    upsertReviewItem(db, makeReviewItem(
      "automation_gap",
      slug,
      `${agent.name} automation gap: ${field}`,
      detail,
      `appurdex://automation-gap/${slug}/${field}`,
    ));
  }
}

function estimateRequestCost(agent) {
  let cost = 1;
  if (agent.githubRepo) cost += 4;
  cost += configuredPackages(agent).length;
  return cost;
}

function selectWorkerAgents(db, options = {}) {
  const allAgents = Array.isArray(db.agents) ? db.agents : [];
  if (!options.tiered) {
    return {
      agents: allAgents.map((agent, index) => ({
        agent,
        slug: agent.slug || agent.id,
        syncTier: inferSyncTier(agent, index),
        estimatedCost: estimateRequestCost(agent),
      })),
      dueCount: allAgents.length,
      skippedDue: 0,
      estimatedRequests: allAgents.reduce((sum, agent) => sum + estimateRequestCost(agent), 0),
      requestBudget: null,
    };
  }

  const nowTime = Date.now();
  const stateBySlug = new Map(getSyncStates().map((state) => [state.slug, state]));
  const parsedBudget = Number(options.requestBudget || process.env.APPURDEX_SYNC_REQUEST_BUDGET || 300);
  const requestBudget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 300;
  const due = allAgents
    .map((agent, index) => {
      const slug = agent.slug || agent.id;
      const state = stateBySlug.get(slug);
      const syncTier = normalizeSyncTier(state?.sync_tier) || inferSyncTier(agent, index);
      const dueAt = state?.next_sync_at ? new Date(state.next_sync_at).getTime() : 0;
      return { agent, slug, syncTier, state, dueAt: Number.isFinite(dueAt) ? dueAt : 0, estimatedCost: estimateRequestCost(agent) };
    })
    .filter((item) => item.dueAt <= nowTime)
    .sort((a, b) => a.dueAt - b.dueAt);

  const selected = [];
  let usedBudget = 0;
  for (const item of due) {
    if (selected.length && usedBudget + item.estimatedCost > requestBudget) continue;
    if (!selected.length && item.estimatedCost > requestBudget) {
      selected.push(item);
      usedBudget += item.estimatedCost;
      break;
    }
    selected.push(item);
    usedBudget += item.estimatedCost;
  }

  return {
    agents: selected,
    dueCount: due.length,
    skippedDue: Math.max(0, due.length - selected.length),
    estimatedRequests: usedBudget,
    requestBudget,
  };
}
export async function runWorker(options = {}) {
  const db = await readDb();
  const startedAt = now();
  const results = [];
  const selection = selectWorkerAgents(db, options);

  db.githubMetrics = db.githubMetrics || {};
  db.githubMetricErrors = db.githubMetricErrors || {};
  db.sourceChecks = db.sourceChecks || {};
  db.workerRuns = db.workerRuns || [];
  const modelPricingSourceResults = await syncModelPricingSources(db);

  for (const selected of selection.agents) {
    const agent = selected.agent;
    const slug = selected.slug;
    let lastError = null;

    try {
      const packageMetric = await fetchPackageMetric(agent);
      applyPackageMetric(agent, packageMetric);

      if (!agent.githubRepo) {
        if (packageMetric) appendMetricSnapshot(db, { agentSlug: slug, package: packageMetric });
        db.sourceChecks[slug] = {
          status: "closed_source",
          method: "not_applicable",
          sourceUrl: agent.sourceUrl || agent.website || null,
          note: "Closed source, no public repository available.",
          lastCheckedAt: now(),
        };
        results.push({ slug, syncTier: selected.syncTier, githubStatus: null, packageStatus: packageMetric?.ok ?? null, skipped: "closed_source" });
        continue;
      }

      const fetchedMetric = await fetchGithubMetric(agent);
      const metric = fetchedMetric?.ok ? addSnapshotTrends(db, slug, fetchedMetric) : fetchedMetric;
      appendMetricSnapshot(db, { agentSlug: slug, github: metric, package: packageMetric });

      if (metric?.ok) {
        db.githubMetrics[slug] = metric;
        delete db.githubMetricErrors[slug];
        db.sourceChecks[slug] = {
          status: "github_verified",
          method: "github_rest_api",
          sourceUrl: metric.sourceUrl,
          lastCheckedAt: metric.lastVerifiedAt,
        };
        const githubHealth = derivedGithubHealth(metric);
        if (Object.keys(githubHealth).length) {
          agent.ecosystemHealth = { ...(agent.ecosystemHealth || {}), ...githubHealth };
          agent.adoptionMetrics = { ...(agent.adoptionMetrics || {}), repoForkStarRatio: githubHealth.repoForkStarRatio };
        }
        agent.verification = {
          ...(agent.verification || {}),
          status: "auto_verified",
          sourceVerifiedAt: metric.lastVerifiedAt,
          method: "github_rest_api",
        };
      } else {
        db.githubMetricErrors[slug] = metric;
        db.sourceChecks[slug] = {
          status: "error",
          method: "github_rest_api",
          sourceUrl: metric?.sourceUrl || "https://github.com/" + agent.githubRepo,
          error: metric?.error || "GitHub REST API sync failed.",
          lastCheckedAt: metric?.lastVerifiedAt || now(),
        };
        agent.verification = {
          ...(agent.verification || {}),
          status: "unverified",
          method: "github_rest_api",
        };
        lastError = metric?.error || null;
      }

      results.push({ slug, syncTier: selected.syncTier, githubStatus: metric?.ok ?? null, packageStatus: packageMetric?.ok ?? null, githubError: metric?.ok === false ? metric.error : null, packageError: packageMetric?.packageDownloadError || null });
    } catch (error) {
      lastError = error.message;
      results.push({ slug, syncTier: selected.syncTier, githubStatus: false, packageStatus: false, error: error.message });
    } finally {
      const syncedAt = now();
      agent.sync_tier = selected.syncTier;
      agent.last_synced_at = syncedAt;
      if (options.tiered) {
        upsertSyncState(slug, {
          syncTier: selected.syncTier,
          lastSyncedAt: agent.last_synced_at,
          nextSyncAt: nextSyncAt(selected.syncTier),
          lastError,
          requestCount: Number(selected.state?.request_count || 0) + selected.estimatedCost,
        });
      }
    }
  }

  const refreshedDb = applyFreshnessToDb(db);
  db.agents = refreshedDb.agents;
  db.freshnessComputedAt = refreshedDb.freshnessComputedAt;

  const finishedAt = now();
  db.workerRuns.unshift({
    id: crypto.randomUUID(),
    startedAt,
    finishedAt,
    tiered: Boolean(options.tiered),
    requestBudget: selection.requestBudget,
    estimatedRequests: selection.estimatedRequests,
    dueCount: selection.dueCount,
    skippedDue: selection.skippedDue,
    results,
    modelPricingSources: modelPricingSourceResults,
  });
  db.workerRuns = db.workerRuns.slice(0, 20);
  await writeDb(db);
  return {
    startedAt,
    finishedAt,
    checked: results.length,
    tiered: Boolean(options.tiered),
    requestBudget: selection.requestBudget,
    estimatedRequests: selection.estimatedRequests,
    dueCount: selection.dueCount,
    skippedDue: selection.skippedDue,
    results,
    modelPricingSources: modelPricingSourceResults,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

