/**
 * Which pages handle their own `?notice=` code, so the global flash listener
 * must stay out — no toast of its own and no cleanup of the query.
 *
 * The public auth routes read the parameter on the server and paint a banner.
 * Staff pages resolve their own wording on the server and hand it to
 * `StaffNoticeToast`, which announces it and clears the query; if the listener
 * cleared it first the page would never see the notice, and if it toasted the
 * operator would read the same copy twice.
 */

/** Public auth routes with their own page-specific notice banners. */
const INLINE_NOTICE_PATHS = new Set([
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

/**
 * @param {string} pathname
 * @returns {boolean} true when the pathname has inline notice handling.
 */
export function isInlineNoticePath(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    INLINE_NOTICE_PATHS.has(normalized) ||
    normalized === "/" ||
    normalized === "/portal"
  );
}

/** Notice codes the root route (`/`) and portal route (`/portal`) render on the sign-in screen. */
const ROOT_INLINE_NOTICE_CODES = new Set([
  "auth-failed",
  "configuration",
  "credentials",
  "google-unavailable",
  "invalid-profile",
  "password-updated",
  "profile-complete",
  "profile-locked",
  "profile-update-failed",
  "sign-in",
]);

/** Every page under the staff panel resolves and announces its own notice. */
const PAGE_OWNED_ROUTE_ROOT = "admin";

/**
 * @param {string} pathname
 * @param {string} noticeCode
 * @returns {boolean} true when the page deals with the notice itself.
 */
export function handlesNoticeOnPage(pathname, noticeCode) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (INLINE_NOTICE_PATHS.has(normalized)) return true;
  if (normalized.split("/")[1] === PAGE_OWNED_ROUTE_ROOT) return true;
  return (
    (normalized === "/" || normalized === "/portal") &&
    ROOT_INLINE_NOTICE_CODES.has(noticeCode)
  );
}
