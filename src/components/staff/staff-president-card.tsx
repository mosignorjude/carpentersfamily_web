import {
  appointPresidentAction,
  revokePresidentAction,
} from "@/app/(staff)/admin/actions";
import type { OfficerHolder } from "@/lib/staff-panel.server";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface PresidentCandidate {
  id: string;
  fullName: string;
  username: string;
}

export default function StaffPresidentCard({
  president,
  candidates,
}: {
  president: OfficerHolder | null;
  candidates: PresidentCandidate[];
}) {
  return (
    <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 sm:p-6 shadow-xs space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Club administration
        </p>
        <h2 className="text-lg font-extrabold text-[#3D291F]">
          Current President
        </h2>
      </div>

      {president ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#D5E4DC] bg-[#F3F8F5] p-4">
            <p className="text-sm font-bold text-[#174C37]">
              {president.fullName}
            </p>
            <p className="text-xs text-[#5C4638]">@{president.username}</p>
            <p className="mt-1 text-[11px] text-[#7A685D]">
              Appointed {formatStaffTimestamp(president.since)}
            </p>
          </div>
          <StaffActionDialog
            action={revokePresidentAction}
            confirmLabel="Revoke President role"
            danger
            description="The officer loses every President authority immediately. The club can run without a President only until a replacement is appointed."
            fields={{ member_id: president.memberId }}
            reasonLabel="Reason for revoking"
            title={`Revoke ${president.fullName} as President?`}
            triggerLabel="Revoke President role"
          />
        </div>
      ) : (
        <p className="rounded-xl border border-[#F0D9A8] bg-[#FBF6EA] p-4 text-xs font-semibold text-[#60451C]">
          Vacant. No member currently holds the President role, so no officer
          can approve dues, correct finance records, or administer members until
          one is appointed.
        </p>
      )}

      <StaffActionDialog
        action={appointPresidentAction}
        confirmLabel={president ? "Replace President" : "Appoint President"}
        danger={Boolean(president)}
        description="The President administers the club: member lifecycle, dues, finance corrections, event operations, and attendance. Appointing a new President revokes the current one."
        reasonHelp="Required. Explain why this member is being appointed President."
        reasonLabel="Reason for appointment"
        title={
          president
            ? `Replace ${president.fullName} as President?`
            : "Appoint a President"
        }
        triggerLabel={president ? "Replace President" : "Appoint President"}
      >
        <label className="grid gap-1 text-xs font-bold text-[#3D291F]">
          Member
          <select defaultValue="" name="member_id" required>
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
        <p className="text-xs text-[#7A685D]">
          No active member is eligible for appointment. Approve a member request
          first.
        </p>
      ) : null}
    </section>
  );
}
