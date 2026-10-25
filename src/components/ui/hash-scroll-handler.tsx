"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Global client handler that smoothly scrolls to the target anchor in the URL hash,
 * providing resilience for conditionally or asynchronously rendered sections/tabs.
 */
export function HashScrollHandler() {
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers re-scroll on page transitions
  useEffect(() => {
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    const maxAttempts = 15; // Poll up to ~1.5s (15 * 100ms)

    const scrollToHash = () => {
      if (typeof window === "undefined" || !window.location.hash) {
        return;
      }

      const rawId = window.location.hash.slice(1);
      if (!rawId) return;

      const findTarget = () =>
        document.getElementById(rawId) ||
        document.getElementById(`event-finance-${rawId}`) ||
        document.getElementById(`attendance-${rawId}`) ||
        document.getElementById(`announcement-${rawId}`) ||
        document.getElementById(`poll-${rawId}`) ||
        document.getElementById(`event-${rawId}`);

      const performScroll = (el: HTMLElement) => {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        el.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      };

      const initialEl = findTarget();
      if (initialEl) {
        performScroll(initialEl);
        return;
      }

      // If not yet mounted in DOM, poll briefly
      if (retryTimer) clearInterval(retryTimer);
      attempts = 0;

      retryTimer = setInterval(() => {
        attempts += 1;
        const el = findTarget();
        if (el) {
          performScroll(el);
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = null;
        } else if (attempts >= maxAttempts) {
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 100);
    };

    // Run on mount or pathname change
    const timeoutId = setTimeout(scrollToHash, 50);

    window.addEventListener("hashchange", scrollToHash);

    return () => {
      clearTimeout(timeoutId);
      if (retryTimer) clearInterval(retryTimer);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, [pathname]);

  return null;
}
