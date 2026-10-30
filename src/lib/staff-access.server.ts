import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StaffProfile {
  id: string;
  fullName: string;
  username: string;
}

/**
 * Reads the signed-in staff administrator or redirects. RLS still governs
 * every read; this guard only decides which surface renders.
 */
export async function requireStaffProfile(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  profile: StaffProfile;
  userId: string;
  email: string | null;
}> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/?notice=sign-in");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status, staff_disabled_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.status !== "staff" ||
    profile.staff_disabled_at !== null
  ) {
    redirect("/?notice=denied");
  }

  return {
    supabase,
    userId: auth.user.id,
    email: auth.user.email ?? null,
    profile: {
      id: profile.id,
      fullName: profile.full_name,
      username: profile.username,
    },
  };
}
