export type BoundedFormDataResult =
  | { kind: "ok"; form: FormData }
  | { kind: "too-large" }
  | { kind: "invalid" };

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
): Promise<BoundedFormDataResult> {
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

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const boundedRequest = new Request(request.url, {
      body,
      headers: request.headers,
      method: request.method,
    });
    return { kind: "ok", form: await boundedRequest.formData() };
  } catch {
    return { kind: "invalid" };
  }
}
