"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { dispatchFlashCard } from "@/components/ui/flash-card";
import {
  noticeDispatchState,
  staffToastPayload,
} from "@/lib/staff-notice-toast.mjs";
import type { StaffNoticeCopy } from "@/lib/staff-notices";

/**
 * Fires the staff page's own notice copy as a flash card once per arrival, then
 * removes `?notice=` — a refresh shows nothing, and pressing the same button
 * again announces again. Renders nothing: the page keeps its notice in the
 * floating layer rather than in a banner that would survive a reload.
 */
export default function StaffNoticeToast({
  notice,
}: {
  notice?: StaffNoticeCopy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const noticeCode = searchParams.get("notice");
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const dispatch = noticeDispatchState(noticeCode, handledRef.current);
    handledRef.current = dispatch.handled;
    if (!dispatch.announce) return;

    const payload = staffToastPayload(notice);
    if (payload) dispatchFlashCard(payload);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("notice");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [notice, noticeCode, pathname, router, searchParams]);

  return null;
}
