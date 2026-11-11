import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPseudonymSession,
  type PseudonymMemberInput,
  type PseudonymSession,
} from "./pseudonymise";

export async function loadActiveMembersForPseudonymisation(
  supabase: SupabaseClient,
): Promise<PseudonymMemberInput[] | null> {
  const { data, error } = await supabase
    .from("member_profiles")
    .select("id, full_name, username")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(1000);

  if (error || !Array.isArray(data)) {
    return null;
  }

  return data.map((row) => ({
    id: String(row.id),
    full_name: typeof row.full_name === "string" ? row.full_name : "",
    username: typeof row.username === "string" ? row.username : null,
  }));
}

export async function createRequestPseudonymSession(
  supabase: SupabaseClient,
  seedTexts: readonly string[] = [],
): Promise<PseudonymSession | null> {
  const members = await loadActiveMembersForPseudonymisation(supabase);
  if (!members) return null;
  return createPseudonymSession(members, seedTexts);
}
