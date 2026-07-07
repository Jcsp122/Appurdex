export const freeDataSources = [
  {
    id: "official-pricing-pages",
    name: "Official vendor pricing pages",
    category: "pricing",
    cost: "free",
    sourceUrl: "https://cursor.com/pricing",
    displayUse: "Display source link, last checked timestamp, and manually reviewed pricing fields.",
    resaleUse: "Sell normalized factual fields after review; do not resell copied pricing-page text.",
    resaleClassification: "display_only",
    scalability: {
      rating: "manual_review",
      cadence: "daily hash check, manual field approval",
      notes: "No scraping in MVP. Use source hashing and review queue when pricing pages change.",
    },
  },
  {
    id: "github-rest-api",
    name: "GitHub REST API",
    category: "open_source_ecosystem",
    cost: "free with authenticated limits",
    sourceUrl: "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api",
    displayUse: "Display repo stars, forks, open issues, pushed date, and license metadata for public repos.",
    resaleUse: "Sell Appurdex-derived scores and ratios; avoid raw personal/user data and bulk resale of GitHub service data.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_with_auth_and_cache",
      cadence: "daily for repo snapshots; slower for issue/PR velocity",
      notes: "Unauthenticated requests are too low for broad coverage. Use a GitHub App or server token, cache results, and obey secondary limits.",
    },
  },
  {
    id: "statuspage-summary",
    name: "Public Statuspage summary feeds",
    category: "operational_reliability",
    cost: "free public JSON where vendors expose it",
    sourceUrl: "https://developer.statuspage.io/",
    displayUse: "Display current component health, unresolved incidents, and source updated time.",
    resaleUse: "Sell Appurdex-derived uptime/incident summaries. Do not imply SLA-grade uptime unless measured from retained history.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_if_low_frequency",
      cadence: "hourly or daily per configured vendor",
      notes: "One lightweight request per configured status page. Keep historical snapshots yourself if you want 7-day uptime.",
    },
  },
  {
    id: "npm-downloads-api",
    name: "npm download counts API",
    category: "market_adoption",
    cost: "free",
    sourceUrl: "https://raw.githubusercontent.com/npm/registry/main/docs/download-counts.md",
    displayUse: "Display package downloads and daily ranges for known npm packages.",
    resaleUse: "Sell derived growth and adoption metrics. Do not resell npm security/audit data.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_for_known_packages",
      cadence: "daily",
      notes: "Bulk queries support up to 128 packages. Scoped packages are not supported in bulk queries.",
    },
  },
  {
    id: "pypi-stats-api",
    name: "PyPI Stats API",
    category: "market_adoption",
    cost: "free",
    sourceUrl: "https://pypistats.org/api/",
    displayUse: "Display package-level recent downloads for a small configured set of PyPI packages.",
    resaleUse: "Sell derived package adoption metrics from cached results.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "limited_api_use_bigquery_for_scale",
      cadence: "daily for small lists; BigQuery for broad coverage",
      notes: "The API asks users not to bulk-download every package and to cache daily. Use the public BigQuery dataset for large catalogs.",
    },
  },
  {
    id: "pypi-bigquery-public-dataset",
    name: "PyPI public BigQuery dataset",
    category: "market_adoption",
    cost: "free tier available",
    sourceUrl: "https://packaging.python.org/en/latest/guides/analyzing-pypi-package-downloads/",
    displayUse: "Display package download totals and trends from aggregated queries.",
    resaleUse: "Sell Appurdex-derived download trends if query costs and attribution are managed.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "best_for_pypi_scale",
      cadence: "daily or weekly warehouse job",
      notes: "Use partition filters by date and package. Keep query windows tight to stay in the free tier.",
    },
  },
  {
    id: "osv-api",
    name: "OSV.dev API and data dumps",
    category: "security",
    cost: "free",
    sourceUrl: "https://google.github.io/osv.dev/post-v1-querybatch/",
    displayUse: "Display advisory counts and vulnerability summaries for known packages or commits.",
    resaleUse: "Strong source for sellable derived vulnerability metrics with required license attribution.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_with_batching",
      cadence: "daily for configured package versions",
      notes: "Use querybatch for multiple package/version lookups. For very broad coverage, prefer OSV data dumps.",
    },
  },
  {
    id: "deps-dev-api",
    name: "deps.dev API",
    category: "dependency_health",
    cost: "free",
    sourceUrl: "https://docs.deps.dev/api/v3/",
    displayUse: "Display dependency counts, resolved dependency graph summaries, licenses, and advisory statistics.",
    resaleUse: "Generated deps.dev data is CC-BY 4.0; cache and attribute generated derived fields.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_with_cache",
      cadence: "daily or weekly per package version",
      notes: "Clients are expressly permitted to cache API data. Use package/version lookups, not unbounded crawling.",
    },
  },
  {
    id: "swe-bench",
    name: "SWE-bench",
    category: "benchmarks",
    cost: "free",
    sourceUrl: "https://github.com/swe-bench/SWE-bench",
    displayUse: "Display official benchmark scores only when a submission maps clearly to the listed agent/model.",
    resaleUse: "Sell normalized benchmark fields with source attribution and dataset/split labels.",
    resaleClassification: "sellable_derived",
    scalability: {
      rating: "good_static_dataset",
      cadence: "weekly or on leaderboard updates",
      notes: "Do not infer a product score from a model score unless the source explicitly maps them.",
    },
  },
];

export const fieldDataPolicies = {
  pricingPlans: {
    label: "Price / Pricing Plans",
    sourceIds: ["official-pricing-pages"],
  },
  modelPricing: {
    label: "Model Token Pricing",
    sourceIds: ["official-pricing-pages"],
  },
  benchmarks: {
    label: "Performance & Capability Benchmarks",
    sourceIds: ["swe-bench"],
  },
  operationalMetrics: {
    label: "Operational & Reliability Metrics",
    sourceIds: ["statuspage-summary"],
  },
  ecosystemHealth: {
    label: "Open-Source Developer & Ecosystem Health",
    sourceIds: ["github-rest-api", "deps-dev-api", "osv-api"],
  },
  adoptionMetrics: {
    label: "Market & Adoption Momentum",
    sourceIds: ["github-rest-api", "npm-downloads-api", "pypi-stats-api", "pypi-bigquery-public-dataset"],
  },
};

export function sourceCatalogForField(field) {
  const policy = fieldDataPolicies[field];
  if (!policy) return [];
  return policy.sourceIds
    .map((sourceId) => freeDataSources.find((source) => source.id === sourceId))
    .filter(Boolean);
}
