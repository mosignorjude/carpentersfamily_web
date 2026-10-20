"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { getSystemNotice } from "@/lib/system-notices";
import { dispatchFlashCard, FlashCardContainer } from "./flash-card";

function UrlNoticeDetector() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const noticeCode =
      searchParams.get("notice") ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("notice")
        : null);

    if (!noticeCode) {
      lastHandledRef.current = null;
      return;
    }

    if (lastHandledRef.current === noticeCode) return;
    lastHandledRef.current = noticeCode;

    const systemNotice = getSystemNotice(noticeCode);
    if (systemNotice) {
      dispatchFlashCard({
        type: systemNotice.type,
        title: systemNotice.title,
        message: systemNotice.message,
      });
    } else {
      // Dynamic fallback for custom notice strings
      const isError = /error|fail|invalid|denied|reject|could not|cannot/i.test(
        noticeCode,
      );
      dispatchFlashCard({
        type: isError ? "error" : "info",
        title: isError ? "Notice" : "Information",
        message: noticeCode,
      });
    }

    // Clean ?notice= from the browser URL without reload or disrupting tab hashes
    const cleanupTimer = setTimeout(() => {
      try {
        const currentSearch = new URLSearchParams(window.location.search);
        if (currentSearch.has("notice")) {
          currentSearch.delete("notice");
          const newQuery = currentSearch.toString();
          const hash = window.location.hash || "";
          const newUrl = `${pathname}${newQuery ? `?${newQuery}` : ""}${hash}`;
          window.history.replaceState({}, "", newUrl);
        }
      } catch {
        // Non-critical URL cleanup failure in edge/restricted environments
      }
    }, 200);

    return () => clearTimeout(cleanupTimer);
  }, [searchParams, pathname]);

  return null;
}

/**
 * Universal Flash Card Listener & Container.
 * Mount this once in the root layout to handle both programmatic and URL-based flash cards.
 */
export function GlobalFlashListener() {
  return (
    <>
      <FlashCardContainer />
      <Suspense fallback={null}>
        <UrlNoticeDetector />
      </Suspense>
    </>
  );
}
