import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export interface OfficerHolder {
  memberId: string;
  fullName: string;
  username: string;
  since: string;
  status: string;
}

async function loadHolders(
  supabase: ServerSupabaseClient,
  role: "president" | "executive",
): Promise<OfficerHolder[]> {
  const { data: assignments, error } = await supabase
    .from("member_role_assignments")
    .select("member_id, assigned_at")
    .eq("role", role)
    .is("revoked_at", null)
    .order("assigned_at", { ascending: true });

  if (error || !assignments || assignments.length === 0) return [];

  const memberIds = assignments.map((row) => row.member_id);
  const { data: profiles } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status")
    .in("id", memberIds);

  const byId = new Map((profiles ?? []).map((row) => [row.id, row]));

  return assignments.flatMap((assignment) => {
    const profile = byId.get(assignment.member_id);
    if (!profile) return [];
    return [
      {
        memberId: assignment.member_id,
        fullName: profile.full_name,
        username: profile.username,
        since: assignment.assigned_at,
        status: profile.status,
      },
    ];
  });
}

export async function loadPresident(
  supabase: ServerSupabaseClient,
): Promise<OfficerHolder | null> {
  const holders = await loadHolders(supabase, "president");
  return holders[0] ?? null;
}

export async function loadExecutiveRoster(
  supabase: ServerSupabaseClient,
): Promise<OfficerHolder[]> {
  return loadHolders(supabase, "executive");
}
