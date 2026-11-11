export type BoundedJsonResult =
  | { kind: "ok"; data: unknown }
  | { kind: "too-large" }
  | { kind: "invalid" };

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

function defaultPortForProtocol(protocol: string): string {
  return protocol === "https:" ? "443" : protocol === "http:" ? "80" : "";
}

function effectivePort(url: URL): string {
  return url.port || defaultPortForProtocol(url.protocol);
}

function normalizeVercelHostOrigin(rawHost: string | undefined): string | null {
  const trimmed = rawHost?.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function collectTrustedOrigins(expectedUrl: URL): Set<string> {
  const trusted = new Set<string>([expectedUrl.origin]);

  // Support apex <-> www equivalent on the configured HTTPS custom domain
  if (expectedUrl.protocol === "https:") {
    const host = expectedUrl.hostname.toLowerCase();
    const isMultiTenantSuffix = host.endsWith(".vercel.app");
    if (!isMultiTenantSuffix && !isLoopbackHostname(host)) {
      const siblingHost = host.startsWith("www.")
        ? host.slice(4)
        : `www.${host}`;
      if (siblingHost.includes(".")) {
        const siblingUrl = new URL(expectedUrl.origin);
        siblingUrl.hostname = siblingHost;
        trusted.add(siblingUrl.origin);
      }
    }
  }

  // Also trust Vercel platform-injected deployment/preview origins in runtime
  for (const envVar of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const normalized = normalizeVercelHostOrigin(envVar);
    if (normalized) {
      trusted.add(normalized);
      const vUrl = new URL(normalized);
      const vHost = vUrl.hostname.toLowerCase();
      if (!vHost.endsWith(".vercel.app") && !isLoopbackHostname(vHost)) {
        const sibling = vHost.startsWith("www.")
          ? vHost.slice(4)
          : `www.${vHost}`;
        if (sibling.includes(".")) {
          const sibUrl = new URL(normalized);
          sibUrl.hostname = sibling;
          trusted.add(sibUrl.origin);
        }
      }
    }
  }

  return trusted;
}

export function isSameSiteOrigin(
  request: Request,
  expectedOrigin: string,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originUrl: URL;
  let expectedUrl: URL;
  try {
    originUrl = new URL(origin);
    expectedUrl = new URL(expectedOrigin);
  } catch {
    return false;
  }

  if (originUrl.origin === "null") return false;

  const trustedOrigins = collectTrustedOrigins(expectedUrl);
  if (trustedOrigins.has(originUrl.origin)) {
    return true;
  }

  // In local development (when configured site origin is HTTP loopback),
  // accept localhost <-> 127.0.0.1 <-> [::1] on the same configured port or
  // the request's own loopback port.
  if (
    expectedUrl.protocol === "http:" &&
    isLoopbackHostname(expectedUrl.hostname) &&
    originUrl.protocol === "http:" &&
    isLoopbackHostname(originUrl.hostname)
  ) {
    if (effectivePort(originUrl) === effectivePort(expectedUrl)) {
      return true;
    }
    try {
      const reqUrl = new URL(request.url);
      if (
        reqUrl.protocol === "http:" &&
        isLoopbackHostname(reqUrl.hostname) &&
        effectivePort(originUrl) === effectivePort(reqUrl)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d{1,7}$/u.test(contentLength)) {
      return { kind: "invalid" };
    }
    if (Number(contentLength) > maxBytes) {
      return { kind: "too-large" };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { kind: "invalid" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(merged);
    return { kind: "ok", data: JSON.parse(text) };
  } catch {
    return { kind: "invalid" };
  }
}
