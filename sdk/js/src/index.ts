export type AppurdexClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type ApiEnvelope<T> = {
  apiVersion: string;
  data: T;
  [key: string]: unknown;
};

export type ResearchSearchResult = {
  summary: string;
  parserSource: string;
  llmFallback: string;
  filters: Record<string, unknown>;
  groupedBy: string;
  groups: Array<{ label: string; items: Array<Record<string, unknown>> }>;
  compareSuggestion: null | { slugs: string[]; path: string };
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function appendQuery(path: string, query?: RequestOptions["query"]) {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class AppurdexApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(typeof payload === "object" && payload && "error" in payload ? String((payload as { error?: unknown }).error) : `Appurdex API returned ${status}`);
    this.name = "AppurdexApiError";
    this.status = status;
    this.payload = payload;
  }
}

export class AppurdexClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AppurdexClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://appurdex.com").replace(/\/$/, "");
    this.fetchImpl = options.fetch || fetch;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["x-appurdex-api-key"] = this.apiKey;
    const response = await this.fetchImpl(this.baseUrl + appendQuery(path, options.query), {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new AppurdexApiError(response.status, payload);
    return payload as T;
  }

  search = {
    research: (query: string) => this.request<ApiEnvelope<ResearchSearchResult>>("/api/search/research", { method: "POST", body: { query } }),
  };

  agents = {
    list: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/agents"),
    get: (slug: string) => this.request<ApiEnvelope<Record<string, unknown>>>(`/api/v1/agents/${encodeURIComponent(slug)}`),
    categories: () => this.request<ApiEnvelope<string[]>>("/api/v1/categories"),
    bulk: (format?: "csv") => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/bulk/agents", { query: { format } }),
  };

  pricing = {
    products: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/pricing"),
    models: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/model-pricing"),
    sources: () => this.request<ApiEnvelope<Record<string, unknown>>>("/api/v1/source-catalog"),
  };

  history = {
    get: (slug: string) => this.request<ApiEnvelope<Record<string, unknown>>>(`/api/v1/history/${encodeURIComponent(slug)}`),
  };

  appurScore = {
    get: (slug: string) => this.request<ApiEnvelope<Record<string, unknown> | null>>(`/api/v1/appurscore/${encodeURIComponent(slug)}`),
  };

  alerts = {
    list: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/alerts"),
  };

  watchlists = {
    list: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/watchlists"),
    create: (input: { name?: string; agentSlugs?: string[] }) => this.request<ApiEnvelope<Record<string, unknown>>>("/api/v1/watchlists", { method: "POST", body: input }),
    delete: (id: string) => this.request<{ ok: true; apiVersion: string }>(`/api/v1/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  savedComparisons = {
    list: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/saved-comparisons"),
    create: (input: { name?: string; mode?: "products" | "vendors" | "models"; slugs?: string[] }) => this.request<ApiEnvelope<Record<string, unknown>>>("/api/v1/saved-comparisons", { method: "POST", body: input }),
    delete: (id: string) => this.request<{ ok: true; apiVersion: string }>(`/api/v1/saved-comparisons/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  webhooks = {
    list: () => this.request<ApiEnvelope<Array<Record<string, unknown>>>>("/api/v1/webhooks"),
    create: (input: { name?: string; targetUrl: string; events?: string[] }) => this.request<ApiEnvelope<Record<string, unknown>>>("/api/v1/webhooks", { method: "POST", body: input }),
    delete: (id: string) => this.request<{ ok: true; apiVersion: string }>(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    test: (id: string) => this.request<ApiEnvelope<Record<string, unknown>>>(`/api/v1/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }),
    deliveries: (id: string) => this.request<ApiEnvelope<Array<Record<string, unknown>>>>(`/api/v1/webhooks/${encodeURIComponent(id)}/deliveries`),
  };
}