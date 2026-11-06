/**
 * The checkout address bar IS the buyer's session (spec §3): it survives a reload, a back
 * gesture and a pasted link, which nothing else on the page can. Pure — no `window`, no React —
 * so the contract has tests instead of hopes.
 */

export const CHECKOUT_PARAM_KEYS = ["event", "tier", "qty", "step"];
export const MAX_ONLINE_QUANTITY = 10;
export const DRAFT_STORAGE_KEY = "cf-box-office-draft";

/** @typedef {{ id: string, name?: string, price_ngn?: number, capacity: number | null, sold: number }} CheckoutTier */
/** @typedef {{ id: string, tiers: CheckoutTier[] }} CheckoutEvent */
/** @typedef {{ eventId: string, tierId: string, quantity: number, step: 1 | 2, remaining: number | null }} CheckoutState */

/**
 * Seats left, or `null` for an open-ended tier (`capacity is null`).
 * @param {CheckoutTier | null | undefined} tier
 * @returns {number | null}
 */
export function tierRemaining(tier) {
  if (!tier || tier.capacity === null) return null;
  return Math.max(0, tier.capacity - (tier.sold ?? 0));
}

/**
 * @param {number | null} remaining
 * @returns {number} the ceiling the till will offer; a sold-out tier still yields 1 so the
 *   overlay can render "sold out" instead of an arithmetic impossibility.
 */
export function maxQuantityForTier(remaining) {
  if (remaining === null) return MAX_ONLINE_QUANTITY;
  return Math.max(1, Math.min(MAX_ONLINE_QUANTITY, remaining));
}

/**
 * @param {string | number | null | undefined} raw
 * @param {number | null} remaining
 * @returns {number} always within 1..maxQuantityForTier(remaining)
 */
export function clampQuantity(raw, remaining) {
  const wanted = Number.parseInt(String(raw ?? "1"), 10);
  const base = Number.isFinite(wanted) ? wanted : 1;
  return Math.min(Math.max(base, 1), maxQuantityForTier(remaining));
}

/**
 * @param {string} search — with or without the leading `?`
 * @param {CheckoutEvent[]} events — the list the storefront is rendering
 * @returns {CheckoutState | null} `null` means "render the storefront with no overlay", which is
 *   what a stale id from an old bookmark must do (§3).
 */
export function parseCheckoutState(search, events) {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const eventId = params.get("event");
  if (!eventId) return null;
  const event = (events ?? []).find((candidate) => candidate.id === eventId);
  if (!event) return null;
  const tiers = Array.isArray(event.tiers) ? event.tiers : [];
  if (tiers.length === 0) return null;
  const requestedTier = params.get("tier");
  const tier =
    (requestedTier
      ? tiers.find((candidate) => candidate.id === requestedTier)
      : null) ?? tiers[0];
  const remaining = tierRemaining(tier);
  return {
    eventId: event.id,
    tierId: tier.id,
    quantity: clampQuantity(params.get("qty"), remaining),
    step: params.get("step") === "2" ? 2 : 1,
    remaining,
  };
}

/**
 * Foreign parameters (a `notice`, a `ref`) survive; the four checkout keys are set or deleted.
 * @param {string} search
 * @param {CheckoutState | null} state
 */
export function buildCheckoutQuery(search, state) {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (state) {
    params.set("event", state.eventId);
    params.set("tier", state.tierId);
    params.set("qty", String(state.quantity));
    params.set("step", String(state.step));
  } else {
    for (const key of CHECKOUT_PARAM_KEYS) params.delete(key);
  }
  return params.toString();
}

/** @returns {string} a path + query to hand to `history.replaceState` */
export function checkoutHref(pathname, search, state) {
  const query = buildCheckoutQuery(search, state);
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Where a refused submit lands: back inside the overlay, on step 2, with one allowlisted notice.
 * The signature has no name, phone or email parameter on purpose — §14 keeps stranger PII out of
 * Vercel request logs, and a URL is the one place this repo cannot delete after the fact.
 */
export function buildSubmitFailureUrl({ eventId, tierId, quantity, notice }) {
  const params = new URLSearchParams({ notice });
  if (eventId) {
    params.set("event", eventId);
    if (tierId) params.set("tier", tierId);
    params.set("qty", String(clampQuantity(quantity, null)));
    params.set("step", "2");
  }
  return `/tickets?${params.toString()}`;
}
