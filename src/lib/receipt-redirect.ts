/**
 * Strict internal return URL sanitization for receipt upload redirects.
 * Prevents open redirects (`https://`, `//`, `\`) and double-`?` query strings.
 */
export function sanitizeReturnUrl(
  raw: unknown,
  fallback = "/finances",
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return fallback;
  }

  try {
    const parsed = new URL(trimmed, "https://internal.invalid");
    if (parsed.origin !== "https://internal.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildReturnRedirectUrl(
  rawReturnUrl: unknown,
  originUrl: string,
  notice: string,
  fallback = "/finances",
): URL {
  const safePath = sanitizeReturnUrl(rawReturnUrl, fallback);
  const url = new URL(safePath, originUrl);
  url.searchParams.set("notice", notice);
  return url;
}
