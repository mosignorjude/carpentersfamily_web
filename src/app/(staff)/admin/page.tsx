import Link from "next/link";
import StaffOverviewStats, {
  type StaffOverviewStat,
} from "@/components/staff/staff-overview-stats";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { loadPresident } from "@/lib/staff-panel.server";
import {
  formatStaffTimestamp,
  humanizeAuditAction,
} from "@/lib/staff-presentation.mjs";

const sections = [
  {
    href: "/admin/staff",
    title: "Staff accounts",
    description:
      "Invite, disable, and re-enable system administrators. The last active account cannot be disabled.",
  },
  {
    href: "/admin/governance",
    title: "President and officers",
    description:
      "Appoint or revoke the club President and review the current Executive roster.",
  },
  {
    href: "/admin/members",
    title: "Member directory",
    description:
      "Approve, reject, deactivate, and reactivate member accounts with an audited reason.",
  },
  {
    href: "/admin/audit",
    title: "Governance audit",
    description:
      "Read the recorded governance history across member, role, staff, and settings changes.",
  },
  {
    href: "/admin/settings",
    title: "Club settings",
    description:
      "Read the configured payment details, attendance threshold, and onboarding state.",
  },
];

function countLabel(count: number | null | undefined) {
  return typeof count === "number" ? String(count) : "—";
}

export default async function StaffOverviewPage() {
  const { supabase } = await requireStaffProfile();

  const [
    staffResult,
    memberResult,
    pendingResult,
    executiveResult,
    president,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "staff")
      .is("staff_disabled_at", null),
    supabase
      .from("member_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("member_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("member_role_assignments")
      .select("id", { count: "exact", head: true })
      .eq("role", "executive")
      .is("revoked_at", null),
    loadPresident(supabase),
    supabase
      .from("audit_log")
      .select("id, action, actor_id, target_member_id, reason, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(5),
  ]);

  const auditRows = auditResult.data ?? [];
  const profileIds = [
    ...new Set(
      auditRows.flatMap((row) =>
        row.target_member_id
          ? [row.actor_id, row.target_member_id]
          : [row.actor_id],
      ),
    ),
  ];
  const { data: profiles } =
    profileIds.length > 0
      ? await supabase
          .from("member_profiles")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [] };
  const nameById = new Map(
    (profiles ?? []).map((row) => [row.id, row.full_name]),
  );

  const stats: StaffOverviewStat[] = [
    {
      label: "Active staff",
      value: countLabel(staffResult.count),
      hint: "System administrators with panel access",
    },
    {
      label: "President",
      value: president ? president.fullName : "Vacant",
      hint: president
        ? `Appointed ${formatStaffTimestamp(president.since)}`
        : "No officer holds the role",
    },
    {
      label: "Executives",
      value: countLabel(executiveResult.count),
      hint: "Current executive assignments",
    },
    {
      label: "Active members",
      value: countLabel(memberResult.count),
      hint: "Approved member accounts",
    },
    {
      label: "Pending requests",
      value: countLabel(pendingResult.count),
      hint: "Awaiting an approval decision",
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Club overview
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          Staff administrators keep the club's identity model intact. The
          President runs the club's operations; staff appoint the President and
          manage accounts.
        </p>
      </section>

      <StaffOverviewStats stats={stats} />

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-extrabold text-[#3D291F]">
            Recent governance activity
          </h2>
          <Link
            className="text-xs font-bold text-[#174C37] hover:underline"
            href="/admin/audit"
          >
            Open the audit viewer
          </Link>
        </div>
        {auditRows.length > 0 ? (
          <ul className="divide-y divide-[#F1EBE3]">
            {auditRows.map((row) => (
              <li className="py-2 text-xs" key={row.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-[#3D291F]">
                    {humanizeAuditAction(row.action)}
                  </p>
                  <p className="text-[#7A685D]">
                    {formatStaffTimestamp(row.occurred_at)}
                  </p>
                </div>
                <p className="text-[#5C4638]">
                  {nameById.get(row.actor_id) ?? "Unknown actor"}
                  {row.target_member_id
                    ? ` · ${nameById.get(row.target_member_id) ?? "Unknown member"}`
                    : ""}
                </p>
                <p className="text-[#7A685D]">{row.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#7A685D]">
            No governance activity has been recorded yet.
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            className="rounded-2xl border border-[#E5DDD3] bg-white p-4 shadow-xs hover:border-[#174C37]"
            href={section.href}
            key={section.href}
          >
            <p className="text-sm font-extrabold text-[#3D291F]">
              {section.title}
            </p>
            <p className="mt-1 text-xs text-[#7A685D]">{section.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
