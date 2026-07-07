import { Resend } from "resend";
import { ALERT_CHANGE_TYPES, headingForChangeType, normalizeAlertTypes } from "./change-types.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function watchedProductPrefs(watchlists = []) {
  const prefs = new Map();
  for (const list of watchlists) {
    for (const item of list.items || []) {
      const productId = item.productId || item.agentSlug;
      if (!productId) continue;
      const existing = prefs.get(productId) || new Set();
      normalizeAlertTypes(item.alertTypes).forEach((type) => existing.add(type));
      prefs.set(productId, existing);
    }
  }
  return prefs;
}

export function buildWeeklyDigest({ user, watchlists = [], events = [] }) {
  const prefs = watchedProductPrefs(watchlists);
  const grouped = Object.fromEntries(ALERT_CHANGE_TYPES.map((type) => [type, []]));
  for (const event of events) {
    const payload = event.payload || {};
    const productId = payload.productId || payload.agentSlug || event.agentSlug;
    const changeType = payload.changeType;
    if (!productId || !changeType || !prefs.get(productId)?.has(changeType)) continue;
    grouped[changeType].push({ ...event, payload, productId, changeType });
  }
  const sections = ALERT_CHANGE_TYPES.map((changeType) => ({
    changeType,
    heading: headingForChangeType(changeType),
    items: grouped[changeType],
  })).filter((section) => section.items.length);
  return {
    userId: user?.id || null,
    email: user?.email || null,
    sectionCount: sections.length,
    alertCount: sections.reduce((total, section) => total + section.items.length, 0),
    sections,
  };
}

export function renderWeeklyDigest(digest) {
  const subject = "Appurdex weekly watchlist digest";
  const text = digest.sections.length
    ? digest.sections.map((section) => [
      section.heading,
      ...section.items.map((item) => `- ${item.payload.title || item.payload.field || item.productId}: ${item.payload.newValue || item.payload.detail || "Change detected"}`),
    ].join("\n")).join("\n\n")
    : "No watchlist alerts matched your enabled alert types this week.";
  const html = digest.sections.length
    ? digest.sections.map((section) => `<h2>${escapeHtml(section.heading)}</h2><ul>${section.items.map((item) => `<li><strong>${escapeHtml(item.payload.title || item.productId)}</strong><br>${escapeHtml(item.payload.newValue || item.payload.detail || "Change detected")}</li>`).join("")}</ul>`).join("")
    : "<p>No watchlist alerts matched your enabled alert types this week.</p>";
  return { subject, text, html };
}

export async function sendWeeklyDigestEmail({ user, digest }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return { ok: false, status: "unconfigured", missing: ["RESEND_API_KEY", "EMAIL_FROM"].filter((key) => !process.env[key]) };
  }
  if (!user?.email) return { ok: false, status: "missing_email" };
  if (!digest.alertCount) return { ok: true, status: "skipped_empty" };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const message = renderWeeklyDigest(digest);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (result.error) return { ok: false, status: "send_failed", error: result.error.message || "Resend failed to send the digest." };
  return { ok: true, status: "sent", id: result.data?.id || null };
}

