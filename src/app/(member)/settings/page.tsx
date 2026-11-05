import { redirect } from "next/navigation";
import { ProfileSettingsView } from "@/components/settings/profile-settings-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPrimaryRole } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/portal?notice=sign-in");
  }

  const [profileResult, roleResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("full_name, username, avatar_url, status")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);

  if (
    profileResult.error ||
    !profileResult.data ||
    profileResult.data.status !== "active"
  ) {
    redirect("/portal");
  }

  const roles = (roleResult.data ?? []).map((r) => r.role);

  return (
    <ProfileSettingsView
      avatarUrl={profileResult.data.avatar_url ?? null}
      email={authData.user.email ?? ""}
      fullName={profileResult.data.full_name}
      role={formatPrimaryRole(roles)}
      username={profileResult.data.username}
    />
  );
}
