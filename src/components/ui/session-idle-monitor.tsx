"use client";

import { useEffect, useRef } from "react";
import { signOutAction } from "@/app/actions";

/**
 * Automatically signs out the member session after 4 hours of inactivity,
 * including when an inactive background browser tab is resumed after hours/days.
 */
export const SESSION_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const LAST_ACTIVE_STORAGE_KEY = "cf_session_last_active_at";
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

export function SessionIdleMonitor() {
  const signingOutRef = useRef(false);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const triggerIdleSignOut = () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      try {
        window.localStorage.removeItem(LAST_ACTIVE_STORAGE_KEY);
      } catch {
        // Ignore storage errors in restricted modes
      }
      void signOutAction();
    };

    const readLastActive = (): number | null => {
      try {
        const raw = window.localStorage.getItem(LAST_ACTIVE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch {
        return null;
      }
    };

    const writeLastActive = (now: number) => {
      lastWriteRef.current = now;
      try {
        window.localStorage.setItem(LAST_ACTIVE_STORAGE_KEY, String(now));
      } catch {
        // Ignore storage errors
      }
    };

    const checkOrRefreshActivity = (isUserInteraction: boolean) => {
      if (signingOutRef.current) return;
      const now = Date.now();
      const lastActive = readLastActive();

      if (lastActive !== null && now - lastActive >= SESSION_IDLE_TIMEOUT_MS) {
        triggerIdleSignOut();
        return;
      }

      if (
        lastActive === null ||
        (isUserInteraction &&
          now - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS)
      ) {
        writeLastActive(now);
      }
    };

    // Initial check on mount
    checkOrRefreshActivity(true);

    const handleUserActivity = () => {
      checkOrRefreshActivity(true);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkOrRefreshActivity(false);
      }
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const eventName of events) {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    }
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const intervalId = window.setInterval(() => {
      checkOrRefreshActivity(false);
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, handleUserActivity);
      }
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
