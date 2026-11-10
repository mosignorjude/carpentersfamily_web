export type BoundedJsonResult =
  | { kind: "ok"; data: unknown }
  | { kind: "too-large" }
  | { kind: "invalid" };

export function isSameSiteOrigin(
  request: Request,
  expectedOrigin: string,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
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
