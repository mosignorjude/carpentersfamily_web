"use client";

import { Download, Eye } from "lucide-react";
import type React from "react";
import { useState } from "react";
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
}

export const ReceiptCell: React.FC<ReceiptCellProps> = ({
  paymentMethod,
  paymentStatus = "paid",
  receipt,
  isLegacy,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);

  if (paymentMethod === "bank_transfer" && receipt) {
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

  if (
    paymentMethod === "bank_transfer" &&
    paymentStatus === "paid" &&
    !receipt &&
    isLegacy
  ) {
    return (
      <span className="text-xs italic text-stone-500">
        Receipt not recorded (legacy)
      </span>
    );
  }

  if (paymentMethod === "bank_transfer" && paymentStatus !== "paid") {
    return (
      <span className="text-xs text-stone-500">
        Bank Transfer (awaiting payment)
      </span>
    );
  }

  if (paymentMethod === "cash") {
    return <span className="text-xs text-stone-600 font-medium">Cash</span>;
  }

  return <span className="text-xs text-stone-400">Not recorded</span>;
};
