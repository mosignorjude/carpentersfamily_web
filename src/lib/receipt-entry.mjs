import { createHash, randomUUID } from "node:crypto";
import { buildReceiptObjectKey, receiptRequirement } from "./receipt-rules.mjs";

export async function runReceiptEntry(input, deps, commit) {
  const { storage, validateReceipt, newId = randomUUID } = deps;
  const requirement = receiptRequirement(
    input.paymentMethod,
    input.paymentStatus,
    {
      hasReceipt: input.hasReceipt,
      allowLegacyMethod: input.allowLegacyMethod,
    },
  );

  if (requirement === "unsupported") {
    return { kind: "error", notice: "invalid-request" };
  }

  let prepared = null;
  if (requirement === "required") {
    if (!input.file) return { kind: "error", notice: "receipt-required" };
    if (!storage) {
      return { kind: "error", notice: "receipt-storage-unavailable" };
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const validated = validateReceipt(input.file.name, input.file.type, bytes);
    if (!validated) return { kind: "error", notice: "receipt-invalid" };

    const receiptId = newId();
    prepared = {
      receiptId,
      objectKey: buildReceiptObjectKey({
        scope: input.scope,
        targetId: input.targetId,
        receiptId,
        contentType: validated.contentType,
      }),
      originalFilename: validated.filename,
      contentType: validated.contentType,
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };

    try {
      await storage.putObject(prepared.objectKey, bytes, prepared.contentType);
    } catch {
      return { kind: "error", notice: "receipt-upload-failed" };
    }
  } else if (input.file) {
    return { kind: "error", notice: "receipt-not-allowed" };
  }

  const result = await commit(prepared);

  if (result.kind === "error") {
    if (prepared) {
      await storage.deleteObject(prepared.objectKey).catch(() => undefined);
    }
    return {
      kind: "error",
      notice: "operation-failed",
      error: result.error,
    };
  }

  if (prepared && (result.deduplicated || result.id !== input.targetId)) {
    await storage.deleteObject(prepared.objectKey).catch(() => undefined);
  }

  return { kind: "ok", id: result.id, deduplicated: result.deduplicated };
}
