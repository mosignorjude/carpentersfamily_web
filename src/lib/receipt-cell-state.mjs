export function resolveReceiptCellState({
  method,
  status,
  hasReceipt,
  isLegacy,
  receiptUnavailable,
}) {
  if (method === "bank_transfer" && hasReceipt) return "view_download";
  if (method === "bank_transfer" && receiptUnavailable)
    return "receipt_unavailable";
  if (
    method === "bank_transfer" &&
    status === "paid" &&
    !hasReceipt &&
    isLegacy
  ) {
    return "legacy_missing";
  }
  if (method === "bank_transfer" && status !== "paid")
    return "pending_commitment";
  if (method === "cash") return "cash";
  if (!method) return "not_recorded";
  return "other";
}
