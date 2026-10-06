import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getExecutiveRolePresentation,
  getMemberAdministrationCapabilities,
  getMemberLifecyclePresentation,
  getMemberStatusLabel,
} from "@/lib/member-administration-presentation.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ExecutiveRoleForm from "./executive-role-form";
import LifecycleForm from "./lifecycle-form";

const notices: Record<string, { message: string; isError: boolean }> = {
  saved: { message: "Member status updated.", isError: false },
  denied: {
    message: "You do not have permission to perform that operation.",
    isError: true,
  },
  "operation-failed": {
    message:
      "The operation was rejected. Check the member state, email confirmation, and reason, then try again.",
    isError: true,
  },
  "role-updated": {
    message: "Executive status updated and recorded in the audit history.",
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
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Member administration unavailable</h1>
          <p role="alert">
            Member administration could not connect to its authentication
            service. No member records were loaded.
          </p>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: ownProfile, error: ownProfileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (ownProfileError || ownProfile?.status !== "active") {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Access denied</h1>
          <p>This account cannot administer membership.</p>
        </section>
      </main>
    );
  }

  const { data: ownRoles, error: roleError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  if (roleError) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Access could not be verified</h1>
          <p role="alert">
            Your role could not be verified. No member records were loaded.
          </p>
          <Link href="/admin/members">Try verifying access again</Link>
        </section>
      </main>
    );
  }

  const capabilities = getMemberAdministrationCapabilities(
    (ownRoles ?? []).map((assignment) => assignment.role),
  );
  if (!capabilities.canApprove) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Access denied</h1>
          <p>This account cannot administer membership.</p>
        </section>
      </main>
    );
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status, profile_completed_at")
    .order("created_at", { ascending: true });
  const notice =
    params.notice && Object.hasOwn(notices, params.notice)
      ? notices[params.notice]
      : undefined;
  const members = membersError ? [] : (memberRows ?? []);
  let executiveMemberIds = new Set<string>();
  let executiveRoleLookupFailed = false;
  if (!membersError && capabilities.canManageExecutiveRole) {
    const activeMemberIds = members
      .filter((member) => member.status === "active")
      .map((member) => member.id);
    if (activeMemberIds.length > 0) {
      const { data: roleAssignments, error: executiveRoleError } =
        await supabase
          .from("member_role_assignments")
          .select("member_id, role")
          .in("member_id", activeMemberIds)
          .is("revoked_at", null);
      if (executiveRoleError) {
        executiveRoleLookupFailed = true;
      } else {
        executiveMemberIds = new Set(
          (roleAssignments ?? [])
            .filter((assignment) => assignment.role === "executive")
            .map((assignment) => assignment.member_id),
        );
      }
    }
  }
  const memberGroups = [
    {
      status: "pending",
      label: "Pending requests",
      rows: members.filter((member) => member.status === "pending"),
    },
    {
      status: "active",
      label: "Active members",
      rows: members.filter((member) => member.status === "active"),
    },
    {
      status: "deactivated",
      label: "Deactivated members",
      rows: members.filter((member) => member.status === "deactivated"),
    },
  ] as const;

  return (
    <main className="shell">
      <section className="panel member-admin-panel">
        <p className="eyebrow">Membership controls</p>
        <h1>Member administration</h1>
        <p>
          Review membership requests and account status. Only the member name,
          username, account state, and profile-completion state are shown here.
        </p>
        <p className="member-admin-scope">
          Executive, Admin, and Backup Admin can approve completed profiles.
          Only Admin and Backup Admin can deactivate or reactivate accounts.
          Admin and Backup Admin can grant or remove Executive status from
          active members; primary Admin and Backup Admin assignments are not
          managed here. PostgreSQL rechecks permissions and account state, and
          records a reasoned audit entry for each change. Database rules also
          keep at least one primary Admin active.
        </p>

        {notice ? (
          <p
            className={notice.isError ? "notice member-admin-error" : "notice"}
            role={notice.isError ? "alert" : "status"}
          >
            {notice.message}
          </p>
        ) : null}

        {membersError ? (
          <p className="notice member-admin-error" role="alert">
            Member records could not be loaded. No member details or actions are
            available until the roster can be verified.{" "}
            <Link href="/admin/members">Try again</Link>.
          </p>
        ) : null}

        {!membersError && executiveRoleLookupFailed ? (
          <p className="notice member-admin-error" role="alert">
            Executive status could not be verified. Executive role changes are
            temporarily unavailable; membership status controls remain
            available.
          </p>
        ) : null}

        {!membersError && members.length === 0 ? (
          <p className="member-admin-empty">
            No member profiles are available.
          </p>
        ) : null}

        {!membersError && members.length > 0 ? (
          <div className="member-status-groups">
            {memberGroups.map((group) => (
              <section
                aria-labelledby={`member-group-${group.status}`}
                className="member-status-group"
                key={group.status}
              >
                <header className="member-status-heading">
                  <h2 id={`member-group-${group.status}`}>{group.label}</h2>
                  <span className="member-status-count">
                    {group.rows.length}
                  </span>
                </header>
                {group.rows.length > 0 ? (
                  <ul className="member-list">
                    {group.rows.map((member) => {
                      const lifecycle = getMemberLifecyclePresentation(
                        member.status,
                        Boolean(member.profile_completed_at),
                        capabilities,
                        member.id === authData.user.id,
                      );
                      const executiveRoleOperation =
                        getExecutiveRolePresentation(
                          member.status,
                          executiveMemberIds.has(member.id),
                          capabilities,
                          executiveRoleLookupFailed,
                        );
                      return (
                        <li className="member-card" key={member.id}>
                          <article>
                            <div className="member-card-heading">
                              <div>
                                <h3>{member.full_name}</h3>
                                <p className="muted">
                                  @{member.username} ·{" "}
                                  {getMemberStatusLabel(member.status)}
                                </p>
                              </div>
                              <span
                                className={
                                  member.profile_completed_at
                                    ? "status-pill complete"
                                    : "status-pill"
                                }
                              >
                                {member.profile_completed_at
                                  ? "Profile complete"
                                  : "Profile incomplete"}
                              </span>
                            </div>
                            {lifecycle.profileCompletionRequired ? (
                              <p
                                className="member-admin-guidance"
                                role="status"
                              >
                                This member must complete their profile before
                                approval is available.
                              </p>
                            ) : null}
                            {lifecycle.selfDeactivationBlocked ? (
                              <p
                                className="member-admin-guidance"
                                role="status"
                              >
                                You cannot deactivate your own account. Another
                                active Admin or Backup Admin must make that
                                change.
                              </p>
                            ) : null}
                            {lifecycle.operation ? (
                              <LifecycleForm
                                memberId={member.id}
                                memberName={member.full_name}
                                operation={lifecycle.operation}
                                label={
                                  lifecycle.operation === "approve"
                                    ? "Approve member"
                                    : lifecycle.operation === "deactivate"
                                      ? "Deactivate member"
                                      : "Reactivate member"
                                }
                              />
                            ) : null}
                            {executiveRoleOperation === "revoke" ? (
                              <p className="member-admin-guidance">
                                Executive status is active for this member.
                              </p>
                            ) : null}
                            {executiveRoleOperation ? (
                              <ExecutiveRoleForm
                                memberId={member.id}
                                memberName={member.full_name}
                                operation={executiveRoleOperation}
                              />
                            ) : null}
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="muted member-status-empty">
                    No {group.label.toLowerCase()}.
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
