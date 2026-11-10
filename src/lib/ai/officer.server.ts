import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OfficerCheckResult =
  | { ok: true; userId: string; fullName: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function requireOfficer(
  supabase: SupabaseClient,
): Promise<OfficerCheckResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return {
      ok: false,
      status: 401,
      error: "Sign in to access AI report tools.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      status: 503,
      error: "Membership status could not be verified.",
    };
  }

  if (profile?.status !== "active") {
    return {
      ok: false,
      status: 403,
      error: "Active membership is required.",
    };
  }

  const { data: isOfficer, error: officerError } =
    await supabase.rpc("is_club_officer");

  if (officerError) {
    return {
      ok: false,
      status: 503,
      error: "Officer permissions could not be verified.",
    };
  }

  if (isOfficer !== true) {
    return {
      ok: false,
      status: 403,
      error: "Only club officers may manage AI report summaries.",
    };
  }

  return {
    ok: true,
    userId: authData.user.id,
    fullName: profile.full_name || "Club Officer",
  };
}
