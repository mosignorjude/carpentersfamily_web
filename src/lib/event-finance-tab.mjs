export const EVENT_FINANCE_TABS = Object.freeze([
  "overview",
  "tickets",
  "expenses",
  "budget",
  "revenue",
  "ledger",
  "statement",
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

/**
 * Allows an event/role mutation triggered inside the event dashboard to return
 * directly to `/events/<eventId>/dashboard?notice=...`, while falling back to
 * `fallbackUrl` for any missing, external, or cross-event `return_to` value.
 */
export function buildSafeEventDashboardReturnUrl(
  eventId,
  notice,
  returnTo,
  fallbackUrl,
) {
  if (typeof returnTo === "string" && typeof eventId === "string" && eventId) {
    const trimmed = returnTo.trim();
    const expectedDashboardPath = `/events/${eventId}/dashboard`;
    if (trimmed === expectedDashboardPath) {
      const params = new URLSearchParams({ notice });
      return `/events/${encodeURIComponent(eventId)}/dashboard?${params.toString()}`;
    }
  }
  return fallbackUrl;
}
