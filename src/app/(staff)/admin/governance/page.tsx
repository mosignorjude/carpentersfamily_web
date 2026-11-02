import StaffClubAdminCard, {
  type ClubAdminCandidate,
} from "@/components/staff/staff-club-admin-card";
import StaffNoticeToast from "@/components/staff/staff-notice-toast";
import StaffPresidentCard, {
  type PresidentCandidate,
} from "@/components/staff/staff-president-card";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { resolveStaffNotice } from "@/lib/staff-notices";
import {
  loadClubAdmin,
  loadExecutiveRoster,
  loadPresident,
} from "@/lib/staff-panel.server";
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
  "club-admin-granted": {
    message:
      "Club Admin appointed. The change is recorded in the audit history and the president has been notified.",
    isError: false,
  },
  "club-admin-revoked": {
    message: "Club Admin revoked. The change is recorded in the audit history.",
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

  const [president, clubAdmin, executives, activeMembers] = await Promise.all([
    loadPresident(supabase),
    loadClubAdmin(supabase),
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

  const adminCandidates: ClubAdminCandidate[] = (activeMembers.data ?? [])
    .filter(
      (row) => row.id !== president?.memberId && row.id !== clubAdmin?.memberId,
    )
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      username: row.username,
    }));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-forest">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-espresso">
          President and officers
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-muted">
          Staff administrators appoint the President. The President then runs
          club operations, including member administration and finance.
        </p>
      </section>

      <StaffNoticeToast notice={notice} />

      <StaffPresidentCard candidates={candidates} president={president} />

      <StaffClubAdminCard candidates={adminCandidates} clubAdmin={clubAdmin} />

      <section className="rounded-2xl border border-linen bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-espresso">
            Executive roster
          </h2>
          <p className="mt-1 text-xs text-muted">
            {executives.length} current executive
            {executives.length === 1 ? " assignment" : " assignments"}.
          </p>
        </div>
        {executives.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
              <caption className="sr-only">Executive officer roster</caption>
              <thead>
                <tr className="border-b border-linen text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-bold" scope="col">
                    Officer
                  </th>
                  <th className="py-2 pr-3 font-bold" scope="col">
                    Status
                  </th>
                  <th className="py-2 font-bold" scope="col">
                    Appointed
                  </th>
                </tr>
              </thead>
              <tbody>
                {executives.map((holder) => (
                  <tr
                    className="border-b border-linen/50 align-top"
                    key={holder.memberId}
                  >
                    <th className="py-3 pr-3 font-normal" scope="row">
                      <p className="font-bold text-espresso">
                        {holder.fullName}
                      </p>
                      <p className="text-muted">@{holder.username}</p>
                    </th>
                    <td className="py-3 pr-3 capitalize text-body">
                      {holder.status}
                    </td>
                    <td className="py-3 text-body">
                      {formatStaffTimestamp(holder.since)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted">
            No member currently holds an Executive role.
          </p>
        )}
        <p className="text-[11px] text-muted">
          Executive roles are granted by the President from the officer
          workspace. Staff administrators review the roster here but cannot
          grant or revoke it.
        </p>
      </section>
    </div>
  );
}
