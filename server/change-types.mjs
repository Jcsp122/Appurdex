export const ALERT_CHANGE_TYPES = ["pricing", "access", "new_tool", "freshness"];

export const CHANGE_TYPE_META = {
  pricing: { label: "Pricing", heading: "Pricing Changes", eventType: "pricing.changed" },
  access: { label: "Access/Availability", heading: "Access/Availability Changes", eventType: "access.changed" },
  new_tool: { label: "New tool", heading: "New Tools", eventType: "tool.added" },
  freshness: { label: "Freshness", heading: "Freshness Changes", eventType: "freshness.changed" },
};

const allTypes = new Set(ALERT_CHANGE_TYPES);

export function normalizeAlertTypes(value, fallback = ALERT_CHANGE_TYPES) {
  const input = Array.isArray(value) ? value : fallback;
  const next = input.map(String).filter((item) => allTypes.has(item));
  return next.length ? [...new Set(next)] : [...fallback];
}

export function changeTypeForField(field = "") {
  const value = String(field || "").toLowerCase();
  if (/pricing|price|plan|tier|billing|token/.test(value)) return "pricing";
  if (/access|availability|model[_ -]?support|model[_ -]?flex|provider|flexibility|choice|api/.test(value)) return "access";
  if (/new[_ -]?tool|tool[_ -]?added|product[_ -]?added|category|ecosystem/.test(value)) return "new_tool";
  if (/fresh|stale|sync/.test(value)) return "freshness";
  return null;
}

export function changeTypeForReviewItem(item = {}) {
  if (allTypes.has(item.changeType)) return item.changeType;
  const type = String(item.type || "").toLowerCase();
  if (/model_pricing|pricing/.test(type)) return "pricing";
  if (/access|model_support/.test(type)) return "access";
  if (/tool_added|new_tool/.test(type)) return "new_tool";
  if (/freshness|stale/.test(type)) return "freshness";
  return changeTypeForField(item.field || item.title || item.detail) || "freshness";
}

export function eventTypeForChangeType(changeType) {
  return CHANGE_TYPE_META[changeType]?.eventType || null;
}

export function headingForChangeType(changeType) {
  return CHANGE_TYPE_META[changeType]?.heading || "Other Changes";
}

