import StaffMemberTable, {
  type StaffMemberRow,
} from "@/components/staff/staff-member-table";
import StaffNotice from "@/components/staff/staff-notice";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";

const pageNotices = {
  "member-approved": {
    message: "Membership approved and recorded in the audit history.",
    isError: false,
  },
  "member-rejected": {
    message: "Membership request rejected and recorded in the audit history.",
    isError: false,
  },
  "member-deactivated": {
    message: "Member account deactivated and recorded in the audit history.",
    isError: false,
  },
  "member-reactivated": {
    message: "Member account reactivated and recorded in the audit history.",
    isError: false,
  },
};

const memberStatuses = new Set([
  "pending",
  "active",
  "deactivated",
  "rejected",
]);

export default async function StaffMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = resolveStaffNotice(params.notice, pageNotices);
  const { supabase } = await requireStaffProfile();

  const { data, error } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status, profile_completed_at, created_at")
    .neq("status", "staff")
    .order("created_at", { ascending: false });

  const members: StaffMemberRow[] = (data ?? []).flatMap((row) =>
    memberStatuses.has(row.status)
      ? [
          {
            id: row.id,
            fullName: row.full_name,
            username: row.username,
            status: row.status as StaffMemberRow["status"],
            profileComplete: row.profile_completed_at !== null,
            requestedAt: row.created_at,
          },
        ]
      : [],
  );

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Member directory
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          Approve, reject, deactivate, and reactivate member accounts. Every
          decision requires a reason and is recorded in the audit history.
        </p>
      </section>

      <StaffNotice notice={notice} />

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        {error ? (
          <p
            className="rounded-xl border border-[#E5C5C1] bg-[#FAF0EE] p-4 text-xs font-semibold text-[#76342D]"
            role="alert"
          >
            The member directory could not be loaded. Refresh the page and try
            again.
          </p>
        ) : (
          <StaffMemberTable members={members} />
        )}
      </section>
    </div>
  );
}
