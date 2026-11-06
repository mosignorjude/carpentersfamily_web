/**
 * Maps a Supabase/PostgREST RPC error to a specific, allowlisted notice code.
 *
 * Database functions raise curated, user-safe messages (e.g. "Attendance check-in is
 * already closed."). Raw messages are never echoed to the browser; instead, known
 * failure classes are translated into notice codes defined in `system-notices.ts`, so
 * users see an actionable explanation rather than a generic failure.
 *
 * The four ticket-till rules map raise texts written in
 * `supabase/migrations/20261106120000_public_ticket_till_and_ledger.sql`; the tests pin them
 * together, so changing a message in SQL without changing it here degrades the notice to
 * `operation-failed` and fails `tests/ticket-notice-mapping.test.mjs`.
 */
export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

const MESSAGE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/already confirmed their email/i, "already-confirmed"],
  [/less than 15 minutes ago/i, "resend-cooldown"],
  [/only a pending applicant/i, "not-pending"],
  [/\bmust confirm their email\b/i, "email-confirmation-required"],
  [/\bmust complete their profile\b/i, "profile-incomplete"],
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
    /add up exactly to the budget|cannot exceed the budget|does not accept budget changes|exceeds? the allowed limit|tier capacity has been reached/i,
    "budget-exceeded",
  ],
  [/already (?:been )?(reviewed|refunded)/i, "already-processed"],
  [/already exists for this email/i, "request-already-pending"],
  [/invite.*expired/i, "invite-expired"],
  [/invite.*(invalid|not found|already been consumed)/i, "invite-invalid"],
  [
    /\balready (in use|has|covers|used)\b|\bduplicate\b|\bmust be unique\b/i,
    "duplicate-record",
  ],
  [
    /\bonly (a|an) (scheduled|completed|pending)\b|\bonly scheduled\b|\brequires? a scheduled\b|\bcan only be (attached|changed)\b/i,
    "invalid-state",
  ],
  [/primary Admin must remain active/i, "revoke-club-admin-first"],
  [/cannot be recorded by a signed-in member/i, "denied"],
  [/still await review/i, "pending-review-blocks-close"],
  [/too many pending ticket orders/i, "ticket-order-limit-reached"],
  [/no longer accepting ticket orders/i, "box-office-closed"],
  [/box office has reached its limit/i, "box-office-at-capacity"],
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
