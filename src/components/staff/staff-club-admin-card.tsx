import {
  staffGrantClubAdminAction,
  staffRevokeClubAdminAction,
} from "@/app/(staff)/admin/actions";
import type { OfficerHolder } from "@/lib/staff-panel.server";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface ClubAdminCandidate {
  id: string;
  fullName: string;
  username: string;
}

export default function StaffClubAdminCard({
  clubAdmin,
  candidates,
}: {
  clubAdmin: OfficerHolder | null;
  candidates: ClubAdminCandidate[];
}) {
  return (
    <section className="rounded-2xl border border-linen bg-white p-5 sm:p-6 shadow-xs space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-forest">
          Money & records authority
        </p>
        <h2 className="text-lg font-extrabold text-espresso">
          Current Club Admin
        </h2>
        <p className="mt-1 text-xs text-muted">
          Runs the club&apos;s records — finances, dues, events and attendance.
          Cannot change the president and cannot appoint another Club Admin. No
          dues are billed while this role is held.
        </p>
      </div>

      {clubAdmin ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-sm font-bold text-forest">
              {clubAdmin.fullName}
            </p>
            <p className="text-xs text-body">@{clubAdmin.username}</p>
            <p className="mt-1 text-[11px] text-muted">
              Appointed {formatStaffTimestamp(clubAdmin.since)}
            </p>
          </div>
          <StaffActionDialog
            action={staffRevokeClubAdminAction}
            confirmLabel="Revoke Club Admin"
            danger
            description="The member keeps their account and loses every Club Admin authority immediately. Their unbilled dues months return when the role is withdrawn, for the club to settle or write off. The president can still run the books until a replacement is appointed."
            fields={{ member_id: clubAdmin.memberId }}
            reasonLabel="Reason for revoking"
            title={`Revoke ${clubAdmin.fullName} as Club Admin?`}
            triggerLabel="Revoke Club Admin"
          />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          Vacant. No member currently holds Club Admin, so dues corrections,
          ledger entries and event finances rest with the president alone.
        </p>
      )}

      <StaffActionDialog
        action={staffGrantClubAdminAction}
        confirmLabel={clubAdmin ? "Replace Club Admin" : "Appoint Club Admin"}
        danger={Boolean(clubAdmin)}
        description="Appointing a Club Admin gives one active member full write access to club money and officer roles. Appointing a new one revokes the current holder. This is recorded in the audit history and the president is notified."
        reasonHelp="Required. Explain why this member needs money authority."
        reasonLabel="Reason for appointment"
        title={
          clubAdmin
            ? `Replace ${clubAdmin.fullName} as Club Admin?`
            : "Appoint a Club Admin"
        }
        triggerLabel={clubAdmin ? "Replace Club Admin" : "Appoint Club Admin"}
      >
        <label className="grid gap-1 text-xs font-bold text-espresso">
          Member
          <select
            aria-required="true"
            className="min-h-11 rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso focus-visible:border-forest focus-visible:outline-hidden"
            defaultValue=""
            name="member_id"
            required
          >
            <option disabled value="">
              Select an active member
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName} (@{candidate.username})
              </option>
            ))}
          </select>
        </label>
      </StaffActionDialog>

      {candidates.length === 0 ? (
        <p className="text-xs text-muted">
          No active member is eligible. Approve a member request first, or
          revoke the president role if the intended holder is the president.
        </p>
      ) : null}
    </section>
  );
}
