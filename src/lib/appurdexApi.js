const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const LOCAL_API_BASE = "http://127.0.0.1:8791";

function navigationApiBase() {
  if (API_BASE) return API_BASE;
  if (typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname) && window.location.port === "5173") {
    return LOCAL_API_BASE;
  }
  return "";
}

async function request(path, options = {}) {
  const makeRequest = (base) => fetch(`${base}${path}`, {
    ...options,
    credentials: options.credentials || "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let response;
  try {
    response = await makeRequest(API_BASE);
  } catch (error) {
    if (API_BASE) throw error;
    response = await makeRequest(LOCAL_API_BASE);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json();
}

export function getPublicAgents() {
  return request("/api/public/agents");
}

export function getAdminState() {
  return request("/api/admin/state");
}

export function submitSuggestion(payload) {
  return request("/api/suggestions", { method: "POST", body: JSON.stringify(payload) });
}

export function submitVendorClaim(payload) {
  return request("/api/vendor-claims", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAgent(slug, payload) {
  return request(`/api/admin/agents/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function updateReviewItem(id, payload) {
  return request(`/api/admin/review-queue/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function createApiKey(payload) {
  return request("/api/admin/api-keys", { method: "POST", body: JSON.stringify(payload) });
}

export function runWorkerNow() {
  return request("/api/admin/run-worker", { method: "POST", body: JSON.stringify({}) });
}
export function getViewer() {
  return request("/api/auth/me");
}

export function startEmailSignIn(email) {
  return request("/api/auth/email/start", { method: "POST", body: JSON.stringify({ email }) });
}

export function logoutViewer() {
  return request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function authNavigationUrl(path) {
  return `${navigationApiBase()}${path}`;
}

export function createCheckoutSession(payload) {
  return request("/api/billing/create-checkout-session", { method: "POST", body: JSON.stringify(payload) });
}

export function createPortalSession() {
  return request("/api/billing/create-portal-session", { method: "POST", body: JSON.stringify({}) });
}

export function createCustomerApiKey(payload) {
  return request("/api/auth/api-keys", { method: "POST", body: JSON.stringify(payload) });
}
export function researchSearch(query) {
  return request("/api/search/research", { method: "POST", body: JSON.stringify({ query }) });
}

export function getAccountWatchlists() {
  return request("/api/account/watchlists");
}

export function createAccountWatchlist(payload) {
  return request("/api/account/watchlists", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteAccountWatchlist(id) {
  return request(`/api/account/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getSavedComparisons() {
  return request("/api/account/saved-comparisons");
}

export function createSavedComparison(payload) {
  return request("/api/account/saved-comparisons", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteSavedComparison(id) {
  return request(`/api/account/saved-comparisons/${encodeURIComponent(id)}`, { method: "DELETE" });
}

