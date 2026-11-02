/**
 * The toast payload a staff page fires for its own `?notice=` code.
 *
 * Staff copy is held longer than the default because the toast is the only
 * record of what the button did.
 */

export const STAFF_NOTICE_TOAST_DURATION_MS = 10000;

/**
 * @param {{message: string, isError: boolean}|undefined} copy
 * @returns {{type: "success"|"error", message: string, durationMs: number}|null}
 */
export function staffToastPayload(copy) {
  if (!copy) return null;
  return {
    type: copy.isError ? "error" : "success",
    message: copy.message,
    durationMs: STAFF_NOTICE_TOAST_DURATION_MS,
  };
}

/**
 * Whether the code in the address bar should be announced, and what the page
 * should remember as announced.
 *
 * A cleared query ends the previous notice, so the next arrival of the same
 * code is a fresh action: two consecutive rejections are two toasts.
 *
 * @param {string|null} noticeCode
 * @param {string|null} handledCode
 * @returns {{announce: boolean, handled: string|null}}
 */
export function noticeDispatchState(noticeCode, handledCode) {
  if (!noticeCode) return { announce: false, handled: null };
  if (handledCode === noticeCode) {
    return { announce: false, handled: handledCode };
  }
  return { announce: true, handled: noticeCode };
}
