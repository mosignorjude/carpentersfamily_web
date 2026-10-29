"use client";

import { FileSpreadsheet, FileText, X } from "lucide-react";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface DownloadReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  onExportCsv: () => void;
}

export function DownloadReportModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  onExportCsv,
}: DownloadReportModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    const downloadUrl = `/api/events/${encodeURIComponent(eventId)}/finance-report?format=pdf`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `event-finance-${eventId}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  const handleDownloadCsv = () => {
    onExportCsv();
    onClose();
  };

  return (
    <div
      aria-labelledby="report-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white w-full max-w-sm rounded-[22px] border border-[#E5DDD3] p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <h3
            className="text-lg font-bold text-[#231F1D] tracking-tight"
            id="report-modal-title"
          >
            Download Event Report
          </h3>
          <button
            aria-label="Close dialog"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#7A685D] hover:text-[#231F1D] hover:bg-[#FAF6F0] transition-colors cursor-pointer border-0 bg-transparent"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[#5C4638] leading-relaxed">
          Export the complete financial reconciliation and ticket ledger for{" "}
          <strong className="text-[#231F1D] font-semibold">{eventTitle}</strong>
          .
        </p>

        <div className="space-y-2.5 pt-1">
          {/* Full Audit Report (PDF) */}
          <button
            className="w-full py-3 px-4 rounded-xl bg-[#174C37] text-white text-sm font-semibold flex items-center justify-between hover:bg-[#123E2C] active:scale-[0.99] transition shadow-xs cursor-pointer border-0"
            id="btn-download-pdf-option"
            onClick={handleDownloadPdf}
            type="button"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[#85B89A] shrink-0" />
              <span>Full Audit Report (PDF)</span>
            </div>
            <span className="text-xs bg-[#123E2C] px-2 py-0.5 rounded text-white/90 font-mono">
              PDF
            </span>
          </button>

          {/* Transaction Ledger (CSV) */}
          <button
            className="w-full py-3 px-4 rounded-xl border border-[#CFD5D0] bg-white text-[#231F1D] text-sm font-semibold flex items-center justify-between hover:bg-[#FAF6F0] active:scale-[0.99] transition shadow-xs cursor-pointer"
            id="btn-download-csv-option"
            onClick={handleDownloadCsv}
            type="button"
          >
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-[#174C37] shrink-0" />
              <span>Transaction Ledger (CSV)</span>
            </div>
            <span className="text-xs bg-[#FAF6F0] text-[#5C4638] px-2 py-0.5 rounded font-mono border border-[#E5DDD3]">
              CSV
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
