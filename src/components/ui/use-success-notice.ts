"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { getSystemNotice } from "@/lib/system-notices";

/**
 * Runs `onSuccess` once whenever the URL carries a non-error system notice
 * (for example `?notice=created`). Error notices are ignored so open forms and
 * modals keep the user's input when a server action fails validation.
 */
export function useSuccessNotice(onSuccess: () => void) {
  const searchParams = useSearchParams();
  const noticeCode = searchParams.get("notice");
  const callbackRef = useRef(onSuccess);

  useEffect(() => {
    callbackRef.current = onSuccess;
  });

  useEffect(() => {
    if (!noticeCode) return;
    const notice = getSystemNotice(noticeCode);
    if (notice && notice.type !== "error") {
      callbackRef.current();
    }
  }, [noticeCode]);
}
