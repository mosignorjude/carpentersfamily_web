import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import StaffNav from "@/components/staff/staff-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const officerRoles = new Set(["executive", "admin", "president"]);

export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("full_name, username, status, staff_disabled_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile?.status !== "staff" || profile.staff_disabled_at !== null) {
    // Club officers keep a useful landing page; everyone else is denied.
    if (profile?.status === "active") {
      const { data: assignments } = await supabase
        .from("member_role_assignments")
        .select("role")
        .eq("member_id", authData.user.id)
        .is("revoked_at", null);
      if ((assignments ?? []).some((row) => officerRoles.has(row.role))) {
        redirect("/officers/members");
      }
    }
    redirect("/?notice=denied");
  }

  return (
    <div className="staff-shell">
      <StaffNav fullName={profile.full_name} username={profile.username} />
      <main className="staff-main">{children}</main>
    </div>
  );
}
