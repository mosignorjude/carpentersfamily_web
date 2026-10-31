import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface EmailConfirmationState {
  unconfirmedMemberIds: Set<string>;
  lookupFailed: boolean;
}

/**
 * Reads which members still have to confirm their email address. A failed lookup
 * is reported instead of assumed clean: an unreadable state must not turn into a
 * clickable Approve that the database is about to refuse.
 */
export async function loadEmailConfirmationState(
  supabase: ServerClient,
): Promise<EmailConfirmationState> {
  const { data, error } = await supabase.rpc("unconfirmed_member_email_ids");

  if (error) return { unconfirmedMemberIds: new Set(), lookupFailed: true };

  const rows = (data ?? []) as Array<{ member_id: string }>;
  return {
    unconfirmedMemberIds: new Set(rows.map((row) => row.member_id)),
    lookupFailed: false,
  };
}
