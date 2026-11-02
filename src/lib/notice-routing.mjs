/**
 * Where a `?notice=` code is rendered by the page itself instead of by the
 * floating flash card.
 *
 * A page-rendered banner reads the query parameter on every server render, so
 * the flash listener must leave the parameter in the address bar. Erasing it
 * made the banner vanish within a frame — the staff panel's success and failure
 * notices were never visible to the operator who triggered them.
 */

/** Public auth routes with their own page-specific notice banners. */
const INLINE_NOTICE_PATHS = new Set([
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

/** Notice codes the root route (`/`) renders on the sign-in screen. */
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

/** Every page under the staff panel resolves its notice through StaffNotice. */
const STAFF_ROUTE_ROOT = "admin";

/**
 * @param {string} pathname
 * @param {string} noticeCode
 * @returns {boolean} true when the page shows the notice itself.
 */
export function rendersNoticeInline(pathname, noticeCode) {
  if (INLINE_NOTICE_PATHS.has(pathname)) return true;
  if (pathname.split("/")[1] === STAFF_ROUTE_ROOT) return true;
  return pathname === "/" && ROOT_INLINE_NOTICE_CODES.has(noticeCode);
}
