"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface PDFRenderTask {
  cancel: () => void;
}

interface PDFPageProxy {
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => PDFRenderTask;
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface ReceiptViewerModalProps {
  receiptId: string;
  filename: string;
  contentType: string;
  onClose: () => void;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  receiptId,
  filename,
  contentType,
  onClose,
}) => {
  useModalHygiene({ isOpen: true, onClose });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const downloadUrl = `/api/receipts/${receiptId}`;

  // Image handling via Object URL
  useEffect(() => {
    if (contentType.startsWith("image/")) {
      let active = true;
      let objectUrl: string | null = null;

      fetch(downloadUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load receipt image");
          return res.blob();
        })
        .then((blob) => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (active) {
            setError(
              err instanceof Error ? err.message : "Failed to load image",
            );
            setLoading(false);
          }
        });

      return () => {
        active = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
  }, [downloadUrl, contentType]);

  // PDF handling via PDF.js on canvas
  useEffect(() => {
    if (contentType === "application/pdf") {
      let active = true;
      (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            try {
              pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                "pdfjs-dist/build/pdf.worker.min.mjs",
                import.meta.url,
              ).toString();
            } catch {
              pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
            }
          }

          const doc = (await pdfjs.getDocument({ url: downloadUrl })
            .promise) as unknown as PDFDocumentProxy;
          if (active) {
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setLoading(false);
          }
        } catch (err: unknown) {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : "Failed to parse PDF receipt",
            );
            setLoading(false);
          }
        }
      })();

      return () => {
        active = false;
      };
    }
  }, [downloadUrl, contentType]);

  // Render PDF page to canvas
  useEffect(() => {
    if (pdfDoc && canvasRef.current) {
      let renderTask: PDFRenderTask | null = null;
      pdfDoc.getPage(pageNum).then((page: PDFPageProxy) => {
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTask = page.render({ canvasContext: ctx, viewport });
      });

      return () => {
        if (renderTask) renderTask.cancel();
      };
    }
  }, [pdfDoc, pageNum, scale]);

  return (
    <div
      aria-labelledby="receipt-viewer-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-stone-50">
          <div
            className="truncate pr-4 font-semibold text-stone-800 text-sm"
            id="receipt-viewer-title"
          >
            {filename}
          </div>
          <div className="flex items-center gap-2">
            <a
              className="inline-flex items-center gap-1 rounded bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-300 transition-colors"
              download={filename}
              href={downloadUrl}
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <button
              aria-label="Close receipt viewer"
              className="rounded p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="flex flex-1 items-center justify-center overflow-auto p-4 bg-stone-100 min-h-[300px]">
          {loading && (
            <div className="text-sm text-stone-500">Loading receipt…</div>
          )}
          {error && (
            <div className="text-center text-sm text-red-600">
              <p>{error}</p>
              <a
                className="mt-2 inline-block font-semibold underline"
                download={filename}
                href={downloadUrl}
              >
                Download file directly
              </a>
            </div>
          )}

          {imageUrl && (
            // biome-ignore lint/performance/noImgElement: in-memory blob object URL
            <img
              alt={filename}
              className="max-h-[75vh] max-w-full rounded object-contain shadow"
              src={imageUrl}
            />
          )}

          {contentType === "application/pdf" && !error && (
            <canvas
              className="max-h-[75vh] shadow rounded bg-white"
              ref={canvasRef}
            />
          )}
        </div>

        {/* PDF controls footer */}
        {contentType === "application/pdf" && !error && !loading && (
          <div className="flex items-center justify-between border-t px-4 py-2 bg-stone-50 text-xs">
            <div className="flex items-center gap-1">
              <button
                className="rounded p-1 hover:bg-stone-200 disabled:opacity-40 cursor-pointer"
                disabled={pageNum <= 1}
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                Page {pageNum} of {numPages}
              </span>
              <button
                className="rounded p-1 hover:bg-stone-200 disabled:opacity-40 cursor-pointer"
                disabled={pageNum >= numPages}
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                type="button"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="rounded p-1 hover:bg-stone-200 cursor-pointer"
                onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
                type="button"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span>{Math.round(scale * 100)}%</span>
              <button
                className="rounded p-1 hover:bg-stone-200 cursor-pointer"
                onClick={() => setScale((s) => Math.min(2.0, s + 0.2))}
                type="button"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
