import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberAdminPageView } from "@/components/admin/members/member-admin-page-view";
import type {
  ClubMemberRecord,
  EventAssignment,
  EventStaffRole,
  ManagedEvent,
  MemberAdminAuditEntry,
  OfficerRole,
} from "@/components/admin/members/member-admin-types";
import { DataUnavailableCard } from "@/components/ui/state-screen";
import { getMemberAdministrationCapabilities } from "@/lib/member-administration-presentation.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const notices: Record<string, { message: string; isError: boolean }> = {
  saved: { message: "Member status updated successfully.", isError: false },
  rejected: {
    message: "Membership request rejected and recorded in the audit history.",
    isError: false,
  },
  denied: {
    message: "You do not have permission to perform that operation.",
    isError: true,
  },
  "operation-failed": {
    message:
      "The operation was rejected. Check the member state and required information, then try again.",
    isError: true,
  },
  "role-updated": {
    message: "Club role updated and recorded in the audit history.",
    isError: false,
  },
  "role-saved": {
    message:
      "Event role assignments were updated and recorded in the audit history.",
    isError: false,
  },
  "invalid-request": {
    message: "The member operation details were invalid.",
    isError: true,
  },
};

export default async function MemberAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
  }>;
}) {
  const params = await searchParams;
  const notice =
    params.notice && Object.hasOwn(notices, params.notice)
      ? notices[params.notice]
      : undefined;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DataUnavailableCard
          description="Could not connect to the database service. Please verify your connection and try again."
          title="Member Administration Unavailable"
        />
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  // Fetch own profile
  const { data: ownProfile, error: ownProfileError } = await supabase
    .from("member_profiles")
    .select("status, full_name, username")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (ownProfileError || ownProfile?.status !== "active") {
    redirect("/?notice=sign-in");
  }

  // Fetch own roles
  const { data: ownRoleAssignments, error: roleError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);

  if (roleError) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl border border-[#E5DDD3] p-8 text-center">
          <h1 className="text-xl font-bold text-[#3D291F]">
            Access could not be verified
          </h1>
          <p className="text-xs text-[#7A685D] mt-2" role="alert">
            Your role could not be verified. No member records were loaded.
          </p>
          <Link
            href="/admin/members"
            className="text-xs text-[#2E7D32] hover:underline mt-4 inline-block"
          >
            Try verifying access again
          </Link>
        </div>
      </main>
    );
  }

  const ownRoleList = (ownRoleAssignments ?? []).map((r) => r.role);
  const ownRoles = new Set(ownRoleList);
  const capabilities = getMemberAdministrationCapabilities(ownRoleList);

  if (!capabilities.canApprove) {
    redirect("/?notice=denied");
  }

  let initialOfficerRole: OfficerRole = "executive";
  if (ownRoles.has("admin")) {
    initialOfficerRole = "admin";
  } else if (ownRoles.has("backup_admin")) {
    initialOfficerRole = "backup_admin";
  }

  // Fetch all members
  const { data: memberRows, error: membersError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status, profile_completed_at, created_at")
    .order("created_at", { ascending: true });

  const members = membersError ? [] : (memberRows ?? []);

  let executiveRoleLookupFailed = false;
  if (!membersError && capabilities.canManageExecutiveRole) {
    const activeMemberIds = members
      .filter((m) => m.status === "active")
      .map((m) => m.id);
    if (activeMemberIds.length > 0) {
      const { error: executiveRoleError } = await supabase
        .from("member_role_assignments")
        .select("member_id, role")
        .in("member_id", activeMemberIds)
        .is("revoked_at", null);
      if (executiveRoleError) {
        executiveRoleLookupFailed = true;
      }
    }
  }

  // Fetch all role assignments
  const { data: roleRows } = await supabase
    .from("member_role_assignments")
    .select("member_id, role")
    .is("revoked_at", null);

  const rolesByMember = new Map<string, string>();
  for (const r of roleRows ?? []) {
    if (r.role === "admin") rolesByMember.set(r.member_id, "Admin");
    else if (r.role === "backup_admin" && !rolesByMember.has(r.member_id))
      rolesByMember.set(r.member_id, "Backup Admin");
    else if (r.role === "executive" && !rolesByMember.has(r.member_id))
      rolesByMember.set(r.member_id, "Executive");
  }

  const formatWAT = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const datePart = d.toISOString().slice(0, 10);
      const timePart = d.toLocaleTimeString("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return `${datePart} · ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  const initialMembers: ClubMemberRecord[] =
    !membersError && members.length > 0
      ? members.map((member) => {
          const isSelf = member.id === authData.user.id;
          // Another active Admin or Backup Admin must deactivate your account.
          const isComplete = Boolean(member.profile_completed_at);
          const assignedRole: ClubMemberRecord["clubRole"] =
            (rolesByMember.get(member.id) as ClubMemberRecord["clubRole"]) ||
            "Member";

          return {
            id: member.id,
            fullName: member.full_name,
            username: `@${member.username}`,
            accountStatus: member.status as ClubMemberRecord["accountStatus"],
            profileState: isComplete ? "complete" : "incomplete_bio",
            profileStateDescription: isComplete
              ? "All requirements met: Email verified and profile complete."
              : "Profile documentation incomplete.",
            clubRole: assignedRole,
            requestDateWAT: formatWAT(member.created_at),
            activationDateWAT: isComplete
              ? formatWAT(member.created_at)
              : undefined,
            chapter: "",
            isSelf,
          };
        })
      : [];

  // Fetch events
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, title, event_type, starts_at, status, location, archived_at")
    .order("starts_at", { ascending: false })
    .limit(100);

  const initialEvents: ManagedEvent[] = (eventRows ?? []).map((evt) => {
    const dateObj = new Date(evt.starts_at);
    const dateFormatted = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      dateStyle: "full",
    }).format(dateObj);
    const timeWAT = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      timeStyle: "short",
    }).format(dateObj);

    const typeCapitalized =
      evt.event_type.charAt(0).toUpperCase() + evt.event_type.slice(1);
    const statusCapitalized =
      evt.status.charAt(0).toUpperCase() + evt.status.slice(1);

    return {
      id: evt.id,
      title: evt.title,
      type: typeCapitalized,
      status: statusCapitalized,
      dateFormatted,
      timeWAT,
      location: evt.location || "Asaba, Delta State",
      archived: Boolean(evt.archived_at),
    };
  });

  // Fetch event assignments
  const { data: assignmentRows } = await supabase
    .from("event_role_assignments")
    .select("id, event_id, member_id, role, assigned_at")
    .is("revoked_at", null)
    .order("assigned_at", { ascending: true });

  const memberMap = new Map((memberRows ?? []).map((m) => [m.id, m]));

  const initialAssignments: EventAssignment[] = (assignmentRows ?? []).map(
    (a) => {
      const m = memberMap.get(a.member_id);
      const roleLabel: EventStaffRole =
        a.role === "lead"
          ? "Event lead"
          : a.role === "assistant"
            ? "Event assistant"
            : "Committee";

      return {
        id: a.id,
        eventId: a.event_id,
        memberId: a.member_id,
        memberName: m ? m.full_name : "Active Member",
        memberUsername: m ? `@${m.username}` : "@member",
        eventRole: roleLabel,
        assignedBy: "Executive Council",
        assignedAtWAT: formatWAT(a.assigned_at),
      };
    },
  );

  // Fetch audit log
  const { data: auditRows } = await supabase
    .from("audit_log")
    .select(
      "id, actor_id, action, entity_type, entity_id, target_member_id, reason, occurred_at",
    )
    .order("occurred_at", { ascending: false })
    .limit(50);

  const initialAuditLog: MemberAdminAuditEntry[] = (auditRows ?? []).map(
    (aud) => {
      const actor = memberMap.get(aud.actor_id);
      const target = aud.target_member_id
        ? memberMap.get(aud.target_member_id)
        : null;

      let actionType: MemberAdminAuditEntry["actionType"] =
        "membership_approved";
      if (aud.action.includes("reject")) actionType = "membership_rejected";
      else if (aud.action.includes("deactivat"))
        actionType = "account_deactivated";
      else if (aud.action.includes("reactivat"))
        actionType = "account_reactivated";
      else if (
        aud.action.includes("role_grant") ||
        aud.action.includes("role_assigned")
      )
        actionType = "executive_role_assigned";
      else if (
        aud.action.includes("role_revok") ||
        aud.action.includes("role_removed")
      )
        actionType = "executive_role_removed";

      return {
        id: aud.id,
        timestampWAT: formatWAT(aud.occurred_at),
        actorName: actor ? actor.full_name : "Authorized Officer",
        actorRole: "Officer",
        targetMemberName: target
          ? target.full_name
          : actor
            ? actor.full_name
            : "Club Member",
        targetMemberUsername: target
          ? `@${target.username}`
          : actor
            ? `@${actor.username}`
            : "@member",
        actionType,
        reason: aud.reason,
        details: `Action: ${aud.action} on ${aud.entity_type}`,
      };
    },
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {membersError ? (
        <div
          className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-6"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-800">
            Member records could not be loaded. No member details or actions are
            available until the roster can be verified.{" "}
            <Link href="/admin/members">Try again</Link>.
          </p>
        </div>
      ) : null}
      <MemberAdminPageView
        initialMembers={initialMembers}
        initialEvents={initialEvents}
        initialAssignments={initialAssignments}
        initialAuditLog={initialAuditLog}
        initialOfficerRole={initialOfficerRole}
        currentOfficerId={authData.user.id}
        roleLookupFailed={executiveRoleLookupFailed}
        notice={notice}
      />
    </main>
  );
}
