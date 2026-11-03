/**
 * Which copy a staff banner shows for a `?notice=` code.
 *
 * A page may override the shared wording for a code it owns (the staff panel
 * names the actor and the object), and anything the page does not override
 * falls back to the system notice registry. There is deliberately no middle
 * allowlist: the registry is the allowlist, so a code added there displays on
 * every staff route without a second list being updated in step.
 */

/**
 * @param {string|undefined} code
 * @param {Record<string, {message: string, isError: boolean}>} pageNotices
 * @param {(code: string) => {message: string, type: string}| null | undefined} getNotice
 */
export function resolveNoticeCopy(code, pageNotices, getNotice) {
  if (!code) return undefined;
  if (Object.hasOwn(pageNotices, code)) return pageNotices[code];
  const definition = getNotice(code);
  if (!definition) return undefined;
  return {
    message: definition.message,
    isError: definition.type === "error",
  };
}
