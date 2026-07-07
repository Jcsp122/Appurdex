const GITHUB_API_ROOT = "https://api.github.com/repos";

export async function fetchGithubMetrics(tool) {
  if (!tool.githubRepo) {
    return {
      ok: false,
      toolId: tool.id,
      error: "No GitHub repository configured for this tool.",
    };
  }

  const response = await fetch(`${GITHUB_API_ROOT}/${tool.githubRepo}`, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      toolId: tool.id,
      error: `GitHub returned ${response.status} for ${tool.githubRepo}.`,
    };
  }

  const repo = await response.json();
  return {
    ok: true,
    toolId: tool.id,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    lastCommitDate: repo.pushed_at,
    contributorCount: null,
    releaseCadence: null,
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function fetchMetricsForTools(tools) {
  const withRepos = tools.filter((tool) => tool.githubRepo);

  if (withRepos.length === 0) {
    return {
      metricsByToolId: {},
      errors: [],
      checkedAt: null,
    };
  }

  const results = await Promise.all(withRepos.map(fetchGithubMetrics));
  return {
    metricsByToolId: Object.fromEntries(
      results
        .filter((result) => result.ok)
        .map((result) => [result.toolId, result]),
    ),
    errors: results.filter((result) => !result.ok),
    checkedAt: new Date().toISOString(),
  };
}
