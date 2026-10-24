"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "completing">(
    "idle",
  );
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  }, []);

  const complete = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setProgress(100);
    setStatus("completing");

    cleanupTimeoutRef.current = setTimeout(() => {
      setStatus("idle");
      setProgress(0);
    }, 350);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setStatus("loading");
    setProgress(18);

    // Incrementally crawl forward while waiting for next page
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev;
        const remaining = 90 - prev;
        const step = Math.max(1, Math.floor(remaining * 0.15));
        return Math.min(88, prev + step);
      });
    }, 200);

    // Safety timeout: automatically reset if navigation aborts or hangs > 8s
    safetyTimeoutRef.current = setTimeout(() => {
      complete();
    }, 8000);
  }, [clearTimers, complete]);

  // Listen to route changes (when pathname or searchParams change, navigation completed)
  const isFirstRender = useRef(true);
  const currentRouteKey = `${pathname ?? ""}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (currentRouteKey) {
      complete();
    }
  }, [currentRouteKey, complete]);

  // Global click interceptor on internal links
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return; // Only left clicks
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return; // Ignore modified clicks
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const targetAttr = anchor.getAttribute("target");
      if (targetAttr && targetAttr !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("rel")?.includes("external")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      try {
        const destUrl = new URL(anchor.href, window.location.href);
        const currentUrl = new URL(window.location.href);

        // Cross-origin check
        if (destUrl.origin !== currentUrl.origin) return;

        // Same-page hash anchor check
        if (
          destUrl.pathname === currentUrl.pathname &&
          destUrl.search === currentUrl.search &&
          destUrl.hash !== currentUrl.hash
        ) {
          return;
        }

        // Same exact URL check
        if (destUrl.href === currentUrl.href) return;

        // Valid internal navigation
        start();
      } catch {
        // Ignore invalid URLs
      }
    }

    function handlePopState() {
      start();
    }

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  if (status === "idle") return null;

  return (
    <div
      aria-label="Page navigation progress"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(progress)}
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none h-[3px]"
      role="progressbar"
    >
      <svg
        aria-hidden="true"
        className={`w-full h-full block transition-opacity duration-200 ease-out shadow-[0_0_10px_rgba(23,76,55,0.7),0_0_5px_rgba(214,162,58,0.5)] ${
          status === "completing" ? "opacity-0" : "opacity-100"
        }`}
        preserveAspectRatio="none"
        viewBox="0 0 100 1"
      >
        <defs>
          <linearGradient
            id="cf-nav-progress-gradient"
            x1="0%"
            x2="100%"
            y1="0%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#174C37" />
            <stop offset="55%" stopColor="#2F855A" />
            <stop offset="100%" stopColor="#D6A23A" />
          </linearGradient>
        </defs>
        <rect
          className="transition-all duration-200 ease-out"
          fill="url(#cf-nav-progress-gradient)"
          height="1"
          width={progress}
          x="0"
          y="0"
        />
      </svg>
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}

export default NavigationProgressBar;
