"use client";

import { Download, X } from "lucide-react";
import type React from "react";
import { ReceiptPreview } from "@/components/finances/receipt-preview";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface ReceiptViewerModalProps {
  receiptId: string;
  filename: string;
  contentType: string;
  sha256?: string | null;
  onClose: () => void;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  receiptId,
  filename,
  contentType,
  sha256 = null,
  onClose,
}) => {
  useModalHygiene({ isOpen: true, onClose });

  const downloadUrl = `/api/receipts/${encodeURIComponent(receiptId)}`;

  return (
    <div
      aria-labelledby="receipt-viewer-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white border border-[#E5DDD3] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DDD3] px-4 py-3 bg-[#FAF6F0]">
          <div
            className="truncate pr-4 font-semibold text-[#3D291F] text-sm"
            id="receipt-viewer-title"
          >
            {filename}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E5DDD3] px-3 py-2 min-h-[44px] text-xs font-semibold text-[#174C37] hover:border-[#174C37] transition-colors"
              download={filename}
              href={downloadUrl}
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </a>
            <button
              aria-label="Close receipt viewer"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#5C4638] hover:bg-[#E5DDD3]/60 hover:text-[#3D291F] transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-auto p-4 bg-white">
          <ReceiptPreview
            contentType={contentType}
            fileName={filename}
            receiptId={receiptId}
            sha256={sha256}
          />
        </div>
      </div>
    </div>
  );
};
