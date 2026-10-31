import StaffNotice from "@/components/staff/staff-notice";
import StaffPresidentCard, {
  type PresidentCandidate,
} from "@/components/staff/staff-president-card";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";
import { loadExecutiveRoster, loadPresident } from "@/lib/staff-panel.server";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";

const pageNotices = {
  "president-appointed": {
    message:
      "President appointed. The change is recorded in the audit history.",
    isError: false,
  },
  "president-revoked": {
    message: "President role revoked and recorded in the audit history.",
    isError: false,
  },
};

export default async function StaffGovernancePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = resolveStaffNotice(params.notice, pageNotices);
  const { supabase } = await requireStaffProfile();

  const [president, executives, activeMembers] = await Promise.all([
    loadPresident(supabase),
    loadExecutiveRoster(supabase),
    supabase
      .from("member_profiles")
      .select("id, full_name, username")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const candidates: PresidentCandidate[] = (activeMembers.data ?? [])
    .filter((row) => row.id !== president?.memberId)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      username: row.username,
    }));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          President and officers
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          Staff administrators appoint the President. The President then runs
          club operations, including member administration and finance.
        </p>
      </section>

      <StaffNotice notice={notice} />

      <StaffPresidentCard candidates={candidates} president={president} />

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-[#3D291F]">
            Executive roster
          </h2>
          <p className="mt-1 text-xs text-[#7A685D]">
            {executives.length} current executive
            {executives.length === 1 ? " assignment" : " assignments"}.
          </p>
        </div>
        {executives.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DDD3] text-[11px] uppercase tracking-wider text-[#7A685D]">
                  <th className="py-2 pr-3 font-bold">Officer</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 font-bold">Appointed</th>
                </tr>
              </thead>
              <tbody>
                {executives.map((holder) => (
                  <tr
                    className="border-b border-[#F1EBE3] align-top"
                    key={holder.memberId}
                  >
                    <td className="py-3 pr-3">
                      <p className="font-bold text-[#3D291F]">
                        {holder.fullName}
                      </p>
                      <p className="text-[#7A685D]">@{holder.username}</p>
                    </td>
                    <td className="py-3 pr-3 capitalize text-[#5C4638]">
                      {holder.status}
                    </td>
                    <td className="py-3 text-[#5C4638]">
                      {formatStaffTimestamp(holder.since)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-[#7A685D]">
            No member currently holds an Executive role.
          </p>
        )}
        <p className="text-[11px] text-[#7A685D]">
          Executive roles are granted by the President from the officer
          workspace. Staff administrators review the roster here but cannot
          grant or revoke it.
        </p>
      </section>
    </div>
  );
}
