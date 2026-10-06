import type { ReactNode } from "react";
import AppShell from "@/components/app-shell";
import { getActiveMemberNavigationItems } from "@/lib/app-navigation.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return children;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return children;

  const [profileResult, roleResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("status")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);

  const items = getActiveMemberNavigationItems(
    profileResult.error ? null : profileResult.data?.status,
    (roleResult.data ?? []).map((assignment) => assignment.role),
    Boolean(roleResult.error),
  );

  if (!items) return children;
  return <AppShell items={items}>{children}</AppShell>;
}
