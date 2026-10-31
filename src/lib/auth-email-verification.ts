// A verification token hash is opaque, but Auth only ever mints printable
// ASCII for it, so anything else (whitespace, control characters, non-ASCII)
// is a malformed link rather than a token worth exchanging.
const TOKEN_HASH_PATTERN = /^[!-~]{8,512}$/;

/**
 * The re-sent confirmation link is the only flow that lands here, so the
 * verification type is pinned to "magiclink" rather than taken from the query
 * string: a stray "recovery" hash must not be exchangeable through this route.
 */
export function readConfirmRequest(
  params: URLSearchParams,
): { tokenHash: string; verificationType: "magiclink" } | null {
  if (params.get("type") !== "magiclink") return null;
  const tokenHash = params.get("token_hash") ?? "";
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) return null;
  return { tokenHash, verificationType: "magiclink" };
}

export function confirmNotice(verified: boolean): string {
  return verified ? "email-confirmed" : "confirm-link-invalid";
}
