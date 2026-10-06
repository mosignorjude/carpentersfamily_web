"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PollLiveRefresh({
  activePolls,
}: {
  activePolls: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!activePolls) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [activePolls, router]);

  if (!activePolls) return null;

  return (
    <p className="muted poll-live-note" aria-live="polite">
      Open poll status refreshes every 30 seconds while visible. Exact totals
      stay hidden until the poll closes and at least five members have voted.
    </p>
  );
}
