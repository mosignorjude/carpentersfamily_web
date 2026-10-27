export type ReceiptCellState =
  | "view_download"
  | "receipt_unavailable"
  | "legacy_missing"
  | "pending_commitment"
  | "cash"
  | "not_recorded"
  | "other";

export function resolveReceiptCellState(input: {
  method?: string | null;
  status?: string | null;
  hasReceipt?: boolean;
  isLegacy?: boolean;
  receiptUnavailable?: boolean;
}): ReceiptCellState;
