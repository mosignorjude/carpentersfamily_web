import type { ReactNode } from "react";
import AppShell from "@/components/app-shell";
import type { AppNotification } from "@/components/notifications/notifications-drawer";
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

  const [
    profileResult,
    roleResult,
    notificationResult,
    eventsResult,
    announcementsResult,
  ] = await Promise.all([
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

  const items = getActiveMemberNavigationItems(
    profileResult.error ? null : profileResult.data?.status,
    (roleResult.data ?? []).map((assignment) => assignment.role),
    Boolean(roleResult.error),
  );

  if (!items) return children;

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
    >
      {children}
    </AppShell>
  );
}
