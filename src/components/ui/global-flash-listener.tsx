"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { getSystemNotice } from "@/lib/system-notices";
import { dispatchFlashCard, FlashCardContainer } from "./flash-card";

/**
 * Public auth routes render their own inline, page-specific notice banners.
 * Showing a floating toast there as well would duplicate the message.
 */
const INLINE_NOTICE_ROUTES = new Set([
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

/**
 * Notice codes that the root route (`/`) renders inline on the sign-in or
 * pending-profile screens.
 */
const ROOT_INLINE_NOTICE_CODES = new Set([
  "auth-failed",
  "configuration",
  "credentials",
  "google-unavailable",
  "invalid-profile",
  "password-updated",
  "profile-complete",
  "profile-locked",
  "profile-update-failed",
  "sign-in",
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

    const skipToast =
      INLINE_NOTICE_ROUTES.has(pathname) ||
      (pathname === "/" && ROOT_INLINE_NOTICE_CODES.has(noticeCode));

    // Only allowlisted notice codes may produce a toast. Arbitrary query text is
    // never rendered, which prevents branded-toast spoofing via crafted links.
    const systemNotice = skipToast ? null : getSystemNotice(noticeCode);
    if (systemNotice) {
      dispatchFlashCard({
        type: systemNotice.type,
        title: systemNotice.title,
        message: systemNotice.message,
      });
    }

    if (skipToast) return;

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
