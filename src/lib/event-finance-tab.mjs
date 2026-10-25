export const EVENT_FINANCE_TABS = Object.freeze([
  "overview",
  "tickets",
  "expenses",
  "budget",
  "revenue",
  "reports",
  "team_roles",
  "audit_log",
]);

export function normalizeEventFinanceTab(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EVENT_FINANCE_TABS.includes(normalized) ? normalized : null;
}

/**
 * The dashboard can only restore a tab that still exists in its allowlist, so
 * arbitrary `return_tab` values are dropped rather than echoed into the URL.
 */
export function buildEventFinanceNoticeUrl(eventId, notice, returnTab) {
  const params = new URLSearchParams({ notice });
  const tab = normalizeEventFinanceTab(returnTab);
  if (tab) params.set("tab", tab);
  return `/events/${encodeURIComponent(eventId)}/dashboard?${params.toString()}`;
}
