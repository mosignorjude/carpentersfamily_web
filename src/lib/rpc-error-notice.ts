/**
 * Maps a Supabase/PostgREST RPC error to a specific, allowlisted notice code.
 *
 * Database functions raise curated, user-safe messages (e.g. "Attendance check-in is
 * already closed."). Raw messages are never echoed to the browser; instead, known
 * failure classes are translated into notice codes defined in `system-notices.ts`, so
 * users see an actionable explanation rather than a generic failure.
 */
export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

const MESSAGE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\btheir own\b|\bown account\b|\bown (club role|dues)\b/i,
    "self-action-denied",
  ],
  [/already checked in/i, "already-checked-in"],
  [/archived/i, "event-read-only"],
  [
    /\balready closed\b|\bunavailable or closed\b|\bcannot be reopened\b|\bis locked after\b/i,
    "closed-or-locked",
  ],
  [
    /add up exactly to the budget|cannot exceed the budget|does not accept budget changes|exceeds the allowed limit/i,
    "budget-exceeded",
  ],
  [/already been (reviewed|refunded)/i, "already-processed"],
  [
    /\balready (in use|has|covers|used)\b|\bduplicate\b|\bmust be unique\b/i,
    "duplicate-record",
  ],
  [
    /\bonly (a|an) (scheduled|completed|pending)\b|\bonly scheduled\b|\brequires a scheduled\b|\bcan only be (attached|changed)\b/i,
    "invalid-state",
  ],
];

export function rpcErrorNotice(
  error: RpcErrorLike | null | undefined,
  fallback = "operation-failed",
): string {
  if (!error) return fallback;
  const message = typeof error.message === "string" ? error.message : "";
  for (const [pattern, notice] of MESSAGE_RULES) {
    if (pattern.test(message)) return notice;
  }
  if (error.code === "23505") return "duplicate-record";
  if (error.code === "42501") return "denied";
  return fallback;
}
