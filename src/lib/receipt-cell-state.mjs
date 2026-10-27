export function resolveReceiptCellState({
  method,
  status,
  hasReceipt,
  isLegacy,
  receiptUnavailable,
}) {
  const normMethod = method ? String(method).trim().toLowerCase() : "";
  const isBankTransfer =
    normMethod === "bank_transfer" || normMethod.includes("bank");
  const isCash = normMethod === "cash" || normMethod.includes("cash");

  if (hasReceipt) return "view_download";
  if (isBankTransfer && receiptUnavailable) return "receipt_unavailable";
  if (isBankTransfer && status === "paid" && !hasReceipt && isLegacy) {
    return "legacy_missing";
  }
  if (isBankTransfer && status !== "paid") return "pending_commitment";
  if (isCash) return "cash";
  if (!normMethod) return "not_recorded";
  return "other";
}
