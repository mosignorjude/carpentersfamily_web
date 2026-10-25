export const RECEIPT_SCOPES = ["club", "event", "event_ticket", "dues"];

const EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function receiptExtensionFor(contentType) {
  return EXTENSIONS.get(contentType) ?? null;
}

export function receiptRequirement(paymentMethod, paymentStatus, options = {}) {
  const { hasReceipt = false, allowLegacyMethod = false } = options;
  if (paymentMethod !== "bank_transfer") {
    if (paymentMethod === "cash") return "forbidden";
    return allowLegacyMethod ? "forbidden" : "unsupported";
  }
  if (paymentStatus !== "paid") return "forbidden";
  return hasReceipt ? "forbidden" : "required";
}

export function buildReceiptObjectKey({
  scope,
  targetId,
  receiptId,
  contentType,
}) {
  if (!RECEIPT_SCOPES.includes(scope)) {
    throw new Error("Unknown receipt scope.");
  }
  if (!UUID_PATTERN.test(targetId) || !UUID_PATTERN.test(receiptId)) {
    throw new Error("Receipt target and receipt IDs must be UUIDs.");
  }
  const extension = receiptExtensionFor(contentType);
  if (!extension) throw new Error("Unsupported receipt content type.");
  return `receipts/${scope}/${targetId}/${receiptId}.${extension}`;
}
