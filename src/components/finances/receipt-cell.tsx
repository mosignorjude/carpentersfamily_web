"use client";

import { Download, Eye } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { resolveReceiptCellState } from "@/lib/receipt-cell-state.mjs";
import { ReceiptViewerModal } from "./receipt-viewer";

export interface ReceiptInfo {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes?: number;
}

interface ReceiptCellProps {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  receipt?: ReceiptInfo | null;
  isLegacy?: boolean;
  receiptUnavailable?: boolean;
}

export const ReceiptCell: React.FC<ReceiptCellProps> = ({
  paymentMethod,
  paymentStatus = "paid",
  receipt,
  isLegacy,
  receiptUnavailable,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const state = resolveReceiptCellState({
    method: paymentMethod,
    status: paymentStatus,
    hasReceipt: Boolean(receipt),
    isLegacy,
    receiptUnavailable,
  });

  if (state === "view_download" && receipt) {
    return (
      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
          onClick={() => setViewerOpen(true)}
          type="button"
        >
          <Eye className="h-3.5 w-3.5" />
          Receipt
        </button>
        <a
          className="text-stone-400 hover:text-stone-700 cursor-pointer"
          download={receipt.filename}
          href={`/api/receipts/${receipt.id}`}
          title="Download receipt"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        {viewerOpen && (
          <ReceiptViewerModal
            contentType={receipt.contentType}
            filename={receipt.filename}
            onClose={() => setViewerOpen(false)}
            receiptId={receipt.id}
          />
        )}
      </div>
    );
  }

  if (state === "receipt_unavailable") {
    return (
      <span
        className="text-xs font-medium text-amber-700"
        title="Receipt metadata could not be loaded. Refresh and retry."
      >
        Receipt evidence unavailable
      </span>
    );
  }

  if (state === "legacy_missing") {
    return (
      <span className="text-xs italic text-stone-500">
        Receipt not recorded (legacy)
      </span>
    );
  }

  if (state === "pending_commitment") {
    return (
      <span className="text-xs text-stone-500">
        Bank Transfer (awaiting payment)
      </span>
    );
  }

  if (state === "cash") {
    return <span className="text-xs text-stone-600 font-medium">Cash</span>;
  }

  return <span className="text-xs text-stone-400">Not recorded</span>;
};
