import { redirect } from "next/navigation";
import type { EventRow } from "@/components/events/event-types";
import { EventsPageView } from "@/components/events/events-page-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Action outcomes (?notice=) are presented by the global flash toast.
export default async function EventsPage() {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, full_name, username")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || profile?.status !== "active") redirect("/");

  const [
    { data: eventData, error: eventsError },
    { data: eventRoleData, error: rolesError },
    { data: clubRoles, error: clubRolesError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id,title,event_type,starts_at,location,description,minutes_enabled,attendance_enabled,budget_enabled,income_enabled,expenses_enabled,ticketing_enabled,status,status_changed_at,archived_at,created_at,updated_at",
      )
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200),
    supabase
      .from("event_role_assignments")
      .select("event_id,role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null)
      .limit(1000),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);

  const eventIds = (eventData ?? []).map((evt) => evt.id);

  const [
    { data: allEventRoles },
    { data: allBudgets },
    { data: allTiers },
    { data: allSales },
  ] =
    eventIds.length > 0
      ? await Promise.all([
          supabase
            .from("event_role_assignments")
            .select(
              "id,event_id,role,member_id,member_profiles:member_id(full_name,username)",
            )
            .in("event_id", eventIds)
            .is("revoked_at", null)
            .order("assigned_at", { ascending: true })
            .limit(1000),
          supabase
            .from("event_budgets")
            .select("event_id,total_ngn")
            .in("event_id", eventIds)
            .limit(1000),
          supabase
            .from("event_ticket_tiers")
            .select("event_id,capacity")
            .in("event_id", eventIds)
            .is("retired_at", null)
            .limit(1000),
          supabase
            .from("event_ticket_sales")
            .select("event_id,quantity")
            .in("event_id", eventIds)
            .is("refunded_at", null)
            .limit(1000),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const roleLabelMap: Record<string, string> = {
    lead: "Event Lead",
    assistant: "Event Assistant",
    committee: "Committee Member",
  };

  const teamByEvent: Record<
    string,
    { id: string; name: string; role: string }[]
  > = {};
  for (const assignment of allEventRoles ?? []) {
    if (!teamByEvent[assignment.event_id]) {
      teamByEvent[assignment.event_id] = [];
    }
    const profileData = Array.isArray(assignment.member_profiles)
      ? assignment.member_profiles[0]
      : assignment.member_profiles;
    const memberName =
      profileData?.full_name || profileData?.username || "Assigned Officer";
    teamByEvent[assignment.event_id].push({
      id: assignment.id,
      name: memberName,
      role: roleLabelMap[assignment.role] || assignment.role,
    });
  }

  const budgetByEvent: Record<string, number> = {};
  for (const b of allBudgets ?? []) {
    budgetByEvent[b.event_id] = b.total_ngn;
  }

  const capacityByEvent: Record<string, number> = {};
  for (const t of allTiers ?? []) {
    capacityByEvent[t.event_id] =
      (capacityByEvent[t.event_id] ?? 0) + (t.capacity || 0);
  }

  const soldByEvent: Record<string, number> = {};
  for (const s of allSales ?? []) {
    soldByEvent[s.event_id] =
      (soldByEvent[s.event_id] ?? 0) + (s.quantity || 0);
  }

  const events = ((eventData ?? []) as EventRow[]).map((evt) => {
    const assignedTeam = teamByEvent[evt.id] ?? [];
    const team = assignedTeam;
    const budgetCeiling = budgetByEvent[evt.id];
    const ticketsSold = soldByEvent[evt.id];
    const ticketsCapacity = capacityByEvent[evt.id];
    const dressCode = null;

    return {
      ...evt,
      team,
      budgetCeiling,
      ticketsSold,
      ticketsCapacity,
      dressCode,
    };
  });
  const rolesList = (clubRoles ?? []).map((assignment) => assignment.role);
  const rolesSet = new Set(rolesList);

  const eventRolesByEvent: Record<string, string[]> = {};
  for (const assignment of eventRoleData ?? []) {
    if (!eventRolesByEvent[assignment.event_id]) {
      eventRolesByEvent[assignment.event_id] = [];
    }
    eventRolesByEvent[assignment.event_id].push(assignment.role);
  }

  const isManager =
    rolesSet.has("executive") ||
    rolesSet.has("admin") ||
    rolesSet.has("backup_admin");

  const userRoleTitle = rolesSet.has("admin")
    ? "Club Administrator (Executive Council)"
    : rolesSet.has("backup_admin")
      ? "Backup Administrator (Trustee)"
      : rolesSet.has("executive")
        ? "Executive Officer"
        : "General Assembly Member";

  const userName = profile?.full_name || profile?.username || "Club Member";

  const eventReadError = eventsError || rolesError || clubRolesError;
  const loadError = eventReadError
    ? "Event information could not be loaded. No event actions are available."
    : undefined;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <EventsPageView
        eventRolesByEvent={eventRolesByEvent}
        events={events}
        isManager={isManager && !eventReadError}
        loadError={loadError}
        roles={rolesList}
        userName={userName}
        userRoleTitle={userRoleTitle}
      />
    </div>
  );
}
