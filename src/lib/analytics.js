const UMAMI_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const UMAMI_SRC = import.meta.env.VITE_UMAMI_SRC || "https://cloud.umami.is/script.js";
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_SRC = import.meta.env.VITE_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";

let initialized = false;

function addScript({ src, attrs }) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = src;
  Object.entries(attrs || {}).forEach(([key, value]) => script.setAttribute(key, value));
  document.head.appendChild(script);
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (UMAMI_ID) addScript({ src: UMAMI_SRC, attrs: { "data-website-id": UMAMI_ID } });
  if (PLAUSIBLE_DOMAIN) {
    window.plausible = window.plausible || function plausibleProxy() { (window.plausible.q = window.plausible.q || []).push(arguments); };
    addScript({ src: PLAUSIBLE_SRC, attrs: { "data-domain": PLAUSIBLE_DOMAIN } });
  }
}

export function trackEvent(name, props = {}) {
  if (typeof window === "undefined") return;
  const safeProps = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  if (window.umami?.track) window.umami.track(name, safeProps);
  if (window.plausible) window.plausible(name, { props: safeProps });
}

export function trackPageView(path) {
  trackEvent("page_view", { path });
}

export function trackSearch(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return;
  trackEvent("search_used", { queryLength: trimmed.length });
}
