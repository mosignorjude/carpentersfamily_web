"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PDFRenderTask {
  cancel: () => void;
  promise?: Promise<void>;
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
  destroy?: () => Promise<void> | void;
}

export interface ReceiptPreviewProps {
  receiptId: string;
  fileName: string;
  contentType: string;
  sha256?: string | null;
  compact?: boolean;
  className?: string;
}

export function ReceiptPreview({
  receiptId,
  fileName,
  contentType,
  sha256 = null,
  compact = false,
  className = "",
}: ReceiptPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const downloadUrl = `/api/receipts/${encodeURIComponent(receiptId)}`;
  const isImage = contentType.startsWith("image/");
  const isPdf =
    contentType === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let loadedDoc: PDFDocumentProxy | null = null;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setImageUrl(null);
    setPdfDoc(null);
    setPageNum(1);
    setNumPages(1);

    if (!isImage && !isPdf) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    (async () => {
      try {
        const res = await fetch(downloadUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Not authorized to inspect this receipt."
              : "Failed to load receipt document.",
          );
        }

        if (isImage) {
          const blob = await res.blob();
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setLoading(false);
          return;
        }

        const buffer = await res.arrayBuffer();
        if (!active) return;
        const data = new Uint8Array(buffer);

        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }

        const doc = (await pdfjs.getDocument({ data })
          .promise) as unknown as PDFDocumentProxy;
        if (!active) {
          await doc.destroy?.();
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: unknown) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load receipt preview.",
        );
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void loadedDoc?.destroy?.();
    };
  }, [downloadUrl, isImage, isPdf]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: PDFRenderTask | null = null;

    pdfDoc
      .getPage(pageNum)
      .then((page: PDFPageProxy) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTask = page.render({ canvasContext: ctx, viewport });
        renderTask.promise?.catch((err: unknown) => {
          const isRenderCancelled =
            err instanceof Error && err.name === "RenderingCancelledException";
          if (!cancelled && !isRenderCancelled) {
            setError("Unable to render PDF page.");
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to render PDF page.");
        }
      });

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, scale]);

  const previewHeightClass = compact
    ? "min-h-[200px] max-h-[340px]"
    : "min-h-[300px] max-h-[75vh]";
  const mediaHeightClass = compact ? "max-h-[310px]" : "max-h-[70vh]";

  return (
    <div className={`space-y-2.5 ${className}`}>
      {sha256 && (
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#174C37] bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg px-2.5 py-1.5">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>SHA-256 Verified</span>
          </span>
          <span className="font-mono text-[10px] text-[#5C4638] truncate">
            {sha256.slice(0, 16)}
          </span>
        </div>
      )}

      <div
        className={`rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] overflow-auto flex items-center justify-center p-2.5 ${previewHeightClass}`}
      >
        {loading && (
          <div className="text-xs font-medium text-[#7A685D] py-8 text-center">
            Loading receipt preview...
          </div>
        )}

        {!loading && error && (
          <div className="text-center p-4 space-y-2.5">
            <p className="text-xs font-semibold text-[#BA3C2A]">{error}</p>
            <a
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white border border-[#E5DDD3] text-xs font-semibold text-[#174C37] hover:border-[#174C37] transition-colors"
              download={fileName}
              href={downloadUrl}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File Directly</span>
            </a>
          </div>
        )}

        {!loading && !error && !isImage && !isPdf && (
          <div className="text-center p-4 space-y-2.5">
            <FileText className="w-8 h-8 mx-auto text-[#174C37]/70" />
            <p className="text-xs font-medium text-[#3D291F]">{fileName}</p>
            <a
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-[#174C37] text-white text-xs font-semibold hover:bg-[#103D2B] transition-colors"
              download={fileName}
              href={downloadUrl}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Receipt</span>
            </a>
          </div>
        )}

        {!loading && !error && imageUrl && (
          // biome-ignore lint/performance/noImgElement: in-memory blob object URL
          <img
            alt={fileName}
            className={`${mediaHeightClass} max-w-full rounded-lg object-contain shadow-xs bg-white`}
            src={imageUrl}
          />
        )}

        {!loading && !error && isPdf && (
          <canvas
            className="max-w-full h-auto rounded-lg shadow-xs bg-white"
            ref={canvasRef}
          />
        )}
      </div>

      {isPdf && !error && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#3D291F]">
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous page"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white border border-transparent hover:border-[#E5DDD3] disabled:opacity-40 cursor-pointer transition-colors"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-[11px] font-semibold px-1 tabular-nums">
              Page {pageNum} of {numPages}
            </span>
            <button
              aria-label="Next page"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white border border-transparent hover:border-[#E5DDD3] disabled:opacity-40 cursor-pointer transition-colors"
              disabled={pageNum >= numPages}
              onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Zoom out"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white border border-transparent hover:border-[#E5DDD3] cursor-pointer transition-colors"
              onClick={() =>
                setScale((s) => Math.max(0.5, Number((s - 0.2).toFixed(2))))
              }
              type="button"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="font-mono text-[11px] font-semibold w-10 text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              aria-label="Zoom in"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white border border-transparent hover:border-[#E5DDD3] cursor-pointer transition-colors"
              onClick={() =>
                setScale((s) => Math.min(2.0, Number((s + 0.2).toFixed(2))))
              }
              type="button"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
