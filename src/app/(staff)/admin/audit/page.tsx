import StaffAuditTable, {
  type StaffAuditRow,
} from "@/components/staff/staff-audit-table";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { loadPresident } from "@/lib/staff-panel.server";

export default async function StaffAuditPage() {
  const { supabase } = await requireStaffProfile();

  const [auditResult, president] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, action, actor_id, target_member_id, reason, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200),
    loadPresident(supabase),
  ]);

  const entries = auditResult.data ?? [];
  const profileIds = [
    ...new Set(
      entries.flatMap((row) =>
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
          .select("id, full_name, status")
          .in("id", profileIds)
      : { data: [] };
  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

  const rows: StaffAuditRow[] = entries.map((entry) => {
    const actor = profileById.get(entry.actor_id);
    return {
      id: entry.id,
      action: entry.action,
      actorName: actor?.full_name ?? "Unknown actor",
      actorIsStaff: actor?.status === "staff",
      actorIsPresident: president?.memberId === entry.actor_id,
      targetName: entry.target_member_id
        ? (profileById.get(entry.target_member_id)?.full_name ??
          "Unknown member")
        : null,
      reason: entry.reason ?? "",
      occurredAt: entry.occurred_at,
    };
  });

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Governance audit
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          The latest 200 recorded governance events. The audit record is
          append-only; this view is read-only.
        </p>
      </section>

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        {auditResult.error ? (
          <p
            className="rounded-xl border border-[#E5C5C1] bg-[#FAF0EE] p-4 text-xs font-semibold text-[#76342D]"
            role="alert"
          >
            The audit history could not be loaded. Refresh the page and try
            again.
          </p>
        ) : (
          <StaffAuditTable rows={rows} />
        )}
      </section>
    </div>
  );
}
