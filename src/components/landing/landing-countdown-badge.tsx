"use client";

import { useEffect, useState } from "react";

interface LandingCountdownBadgeProps {
  startsAt?: string | null;
}

function formatCountdown(targetMs: number) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "Starting Soon";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function LandingCountdownBadge({
  startsAt,
}: LandingCountdownBadgeProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!startsAt) return;
    const targetMs = new Date(startsAt).getTime();
    if (Number.isNaN(targetMs)) return;

    setText(formatCountdown(targetMs));
    const timer = setInterval(() => {
      setText(formatCountdown(targetMs));
    }, 1000);

    return () => clearInterval(timer);
  }, [startsAt]);

  if (!startsAt || !text) return null;

  return (
    <span
      className="rounded-full bg-ochre/20 text-ochre px-3 py-0.5 font-bold text-xs font-mono tabular-nums inline-flex items-center gap-1.5"
      title="Countdown to next event"
    >
      <span aria-hidden="true">⏳</span>
      <span>{text}</span>
    </span>
  );
}
