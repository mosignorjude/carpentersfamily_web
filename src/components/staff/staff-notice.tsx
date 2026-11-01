"use client";

import { useState } from "react";
import type { StaffNoticeCopy } from "@/lib/staff-notices";

export default function StaffNotice({ notice }: { notice?: StaffNoticeCopy }) {
  const [dismissed, setDismissed] = useState(false);

  if (!notice || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("notice")) {
        url.searchParams.delete("notice");
        window.history.replaceState(
          {},
          "",
          url.pathname + (url.search ? url.search : ""),
        );
      }
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold ${
        notice.isError
          ? "border-terracotta/30 bg-terracotta/10 text-terracotta"
          : "border-forest/30 bg-forest/5 text-forest"
      }`}
      role={notice.isError ? "alert" : "status"}
    >
      <span>{notice.message}</span>
      <button
        aria-label="Dismiss notice"
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md p-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest"
        onClick={handleDismiss}
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
