"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

export type FlashCardType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading";

export interface FlashCardItem {
  id: string;
  type: FlashCardType;
  title?: string;
  message: string;
  durationMs?: number;
}

export const FLASH_EVENT_NAME = "cf:flash";

/**
 * Programmatically trigger a flash card notification from anywhere in client code.
 */
export function dispatchFlashCard(payload: {
  type?: FlashCardType;
  title?: string;
  message: string;
  durationMs?: number;
}) {
  const item: FlashCardItem = {
    id: `flash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: payload.type ?? "info",
    title: payload.title,
    message: payload.message,
    durationMs: payload.durationMs ?? 7000,
  };

  if (typeof window !== "undefined") {
    const win = window as unknown as FlashWindow;
    // Queue only while no container is listening, so mounted containers never
    // replay already-delivered toasts after a remount.
    if (!win.__cf_flash_listening__) {
      win.__cf_flash_queue__ = win.__cf_flash_queue__ || [];
      win.__cf_flash_queue__.push(item);
      return;
    }

    window.dispatchEvent(
      new CustomEvent<FlashCardItem>(FLASH_EVENT_NAME, { detail: item }),
    );
  }
}

/**
 * Show an in-progress Action Status Toast for slow mutations (approvals, role
 * updates, ledger writes, file uploads). Automatically replaced when the
 * terminal success/error/warning/info toast arrives.
 */
export function dispatchActionStatusToast(payload: {
  title?: string;
  message: string;
  durationMs?: number;
}) {
  dispatchFlashCard({
    type: "loading",
    title: payload.title ?? "Processing Action",
    message: payload.message,
    durationMs: payload.durationMs ?? 15000,
  });
}

type FlashWindow = {
  __cf_flash_queue__?: FlashCardItem[];
  __cf_flash_listening__?: boolean;
};

const typeStyles: Record<
  FlashCardType,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    progressColor: string;
    Icon: React.ElementType;
    defaultTitle: string;
  }
> = {
  success: {
    border: "border-[#174C37]/30 shadow-emerald-950/5",
    iconBg: "bg-[#174C37]",
    iconColor: "text-white",
    titleColor: "text-[#174C37]",
    progressColor: "bg-[#174C37]",
    Icon: CheckCircle2,
    defaultTitle: "Success",
  },
  error: {
    border: "border-[#BA3C2A]/35 shadow-rose-950/5",
    iconBg: "bg-[#BA3C2A]",
    iconColor: "text-white",
    titleColor: "text-[#BA3C2A]",
    progressColor: "bg-[#BA3C2A]",
    Icon: AlertCircle,
    defaultTitle: "Action Failed",
  },
  warning: {
    border: "border-[#D6A23A]/50 shadow-amber-950/5",
    iconBg: "bg-[#D6A23A]",
    iconColor: "text-white",
    titleColor: "text-[#9E6E16]",
    progressColor: "bg-[#D6A23A]",
    Icon: AlertTriangle,
    defaultTitle: "Notice",
  },
  info: {
    border: "border-[#7A685D]/30 shadow-stone-950/5",
    iconBg: "bg-[#5C4638]",
    iconColor: "text-white",
    titleColor: "text-[#5C4638]",
    progressColor: "bg-[#5C4638]",
    Icon: Info,
    defaultTitle: "Information",
  },
  loading: {
    border: "border-[#174C37]/40 shadow-emerald-950/10",
    iconBg: "bg-[#174C37]",
    iconColor: "text-[#D6A23A]",
    titleColor: "text-[#174C37]",
    progressColor: "bg-[#D6A23A]",
    Icon: Loader2,
    defaultTitle: "Processing Action",
  },
};

/**
 * Individual Flash Card component with timer, hover pause, and manual dismiss.
 */
export function FlashCard({
  item,
  onDismiss,
}: {
  item: FlashCardItem;
  onDismiss: (id: string) => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [started, setStarted] = useState(false);

  const duration = item.durationMs ?? 5000;

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onDismiss(item.id);
    }, 200);
  }, [item.id, onDismiss]);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), 20);
    return () => clearTimeout(startTimer);
  }, []);

  useEffect(() => {
    if (duration <= 0 || isPaused || isClosing) return;

    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, isPaused, isClosing, handleClose]);

  const config = typeStyles[item.type] ?? typeStyles.info;
  const IconComponent = config.Icon;
  const displayTitle = item.title ?? config.defaultTitle;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Mouse hover pauses the notification auto-dismiss timer
    <div
      aria-atomic="true"
      aria-busy={item.type === "loading" ? true : undefined}
      aria-live={item.type === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto relative w-full sm:w-[380px] rounded-2xl bg-white border ${config.border} p-4 shadow-2xl transition-all duration-200 ease-out overflow-hidden ${
        isClosing
          ? "opacity-0 translate-y-[-8px] scale-95"
          : "opacity-100 translate-y-0 scale-100"
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role={item.type === "error" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        {/* Leading Status Icon Badge */}
        <div
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.iconBg} ${config.iconColor} shadow-xs mt-0.5`}
        >
          <IconComponent
            className={`w-4 h-4 ${item.type === "loading" ? "animate-spin" : ""}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-2">
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${config.titleColor} leading-tight`}
          >
            {displayTitle}
          </p>
          <p className="text-xs text-[#3D291F] font-semibold mt-1 leading-snug break-words">
            {item.message}
          </p>
        </div>

        {/* Manual Dismiss "X" Button */}
        <button
          aria-label="Dismiss notification"
          className="shrink-0 -mr-1 -mt-1 p-1 rounded-lg text-[#7A685D] hover:text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer"
          onClick={handleClose}
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-Dismiss Progress Bar (CSP-safe class-based transition, no style attr) */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#E5DDD3]/40 overflow-hidden">
          <div
            className={`h-full ${config.progressColor} opacity-60 transition-[width] ease-linear duration-[7000ms] ${
              started && !isPaused ? "w-0" : "w-full"
            }`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Top-level container managing active flash cards.
 * Mount this once inside AppShell or layout.
 */
export function FlashCardContainer() {
  const [cards, setCards] = useState<FlashCardItem[]>([]);

  useEffect(() => {
    // Flush any pending notifications queued before component mount
    const win = window as unknown as FlashWindow;
    if (win.__cf_flash_queue__ && win.__cf_flash_queue__.length > 0) {
      const queued = [...win.__cf_flash_queue__];
      win.__cf_flash_queue__ = [];
      setCards((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const fresh = queued.filter((q) => !existingIds.has(q.id));
        return [...fresh, ...prev].slice(0, 4);
      });
    }

    const handleFlashEvent = (event: Event) => {
      const customEvent = event as CustomEvent<FlashCardItem>;
      if (!customEvent.detail?.id) return;
      const incoming = customEvent.detail;
      setCards((prev) => {
        if (prev.some((c) => c.id === incoming.id)) return prev;
        // Replace any in-flight "loading" status toast when a new loading or
        // terminal (success/error/warning/info) toast arrives.
        const withoutLoading = prev.filter((c) => c.type !== "loading");
        return [incoming, ...withoutLoading.slice(0, 3)];
      });
    };

    window.addEventListener(FLASH_EVENT_NAME, handleFlashEvent);
    win.__cf_flash_listening__ = true;
    return () => {
      win.__cf_flash_listening__ = false;
      window.removeEventListener(FLASH_EVENT_NAME, handleFlashEvent);
    };
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  if (cards.length === 0) return null;

  return (
    <section
      aria-label="Notifications"
      className="fixed top-5 right-4 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      {cards.map((card) => (
        <FlashCard item={card} key={card.id} onDismiss={handleDismiss} />
      ))}
    </section>
  );
}
