import type { ReactNode } from "react";
import AppShell from "@/components/app-shell";
import type { AppNotification } from "@/components/notifications/notifications-drawer";
import { getActiveMemberNavigationItems } from "@/lib/app-navigation.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPrimaryRole } from "@/lib/user-profile";

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

  const [
    profileResult,
    roleResult,
    notificationResult,
    eventsResult,
    announcementsResult,
  ] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("status, full_name, username")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("notifications")
      .select("id,category,title,body,event_id,created_at,read_at")
      .eq("recipient_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("events")
      .select("id,title")
      .order("starts_at", { ascending: false })
      .limit(20),
    supabase
      .from("announcements")
      .select("id,title")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const roles = (roleResult.data ?? []).map((assignment) => assignment.role);
  const items = getActiveMemberNavigationItems(
    profileResult.error ? null : profileResult.data?.status,
    roles,
    Boolean(roleResult.error),
  );

  if (!items) return children;

  const userProfile = {
    fullName:
      profileResult.data?.full_name ||
      (authData.user.user_metadata?.full_name as string) ||
      "Club Member",
    username:
      profileResult.data?.username ||
      (authData.user.user_metadata?.username as string) ||
      authData.user.email?.split("@")[0] ||
      "member",
    role: formatPrimaryRole(roles),
  };

  const notifications = (notificationResult.data ?? []) as AppNotification[];
  const unreadCount = notifications.filter((n) => n.read_at === null).length;
  const searchData = {
    events: (eventsResult.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
    })),
    announcements: (announcementsResult.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
    })),
  };

  return (
    <AppShell
      currentUserId={authData.user.id}
      dashboard
      initialNotifications={notifications}
      items={items}
      searchData={searchData}
      unreadCount={unreadCount}
      userProfile={userProfile}
    >
      {children}
    </AppShell>
  );
}
