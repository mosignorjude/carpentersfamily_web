"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { rendersNoticeInline } from "@/lib/notice-routing.mjs";
import { getSystemNotice } from "@/lib/system-notices";
import { dispatchFlashCard, FlashCardContainer } from "./flash-card";

const SILENT_READ_NOTICE_CODES = new Set([
  "announcement-read",
  "read",
  "unread",
]);

function UrlNoticeDetector() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const noticeCode = searchParams.get("notice");
  // Guards against double-dispatch (e.g. React Strict Mode effect replays). It is
  // reset once ?notice= is cleared, so a repeated identical notice still shows.
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!noticeCode) {
      lastHandledRef.current = null;
      return;
    }
    if (lastHandledRef.current === noticeCode) return;
    lastHandledRef.current = noticeCode;

    // A page that renders its own banner needs the query parameter to stay in
    // the address bar; clearing it hides the notice, and a toast on top of the
    // banner would show the same copy twice.
    const inlineNotice = rendersNoticeInline(pathname, noticeCode);

    // Only allowlisted notice codes may produce a toast. Arbitrary query text is
    // never rendered, which prevents branded-toast spoofing via crafted links.
    const systemNotice =
      inlineNotice || SILENT_READ_NOTICE_CODES.has(noticeCode)
        ? null
        : getSystemNotice(noticeCode);
    if (systemNotice) {
      dispatchFlashCard({
        type: systemNotice.type,
        title: systemNotice.title,
        message: systemNotice.message,
      });
    }

    if (inlineNotice) return;

    // Remove ?notice= through the router so the next identical notice (for
    // example, two consecutive validation errors) is detected as a new change.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("notice");
    const query = params.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}${query ? `?${query}` : ""}${hash}`, {
      scroll: false,
    });
  }, [noticeCode, pathname, router, searchParams]);

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
