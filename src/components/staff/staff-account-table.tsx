import { setStaffDisabledAction } from "@/app/(staff)/admin/actions";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface StaffAccountRow {
  id: string;
  fullName: string;
  username: string;
  createdAt: string;
  disabledAt: string | null;
}

export default function StaffAccountTable({
  accounts,
  currentUserId,
  activeStaffCount,
}: {
  accounts: StaffAccountRow[];
  currentUserId: string;
  activeStaffCount: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#E5DDD3] text-[11px] uppercase tracking-wider text-[#7A685D]">
            <th className="py-2 pr-3 font-bold">Staff member</th>
            <th className="py-2 pr-3 font-bold">Access</th>
            <th className="py-2 pr-3 font-bold">Created</th>
            <th className="py-2 font-bold">Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const isSelf = account.id === currentUserId;
            const isDisabled = account.disabledAt !== null;
            const lastActiveStaff = !isDisabled && activeStaffCount <= 1;
            return (
              <tr
                className="border-b border-[#F1EBE3] align-top"
                key={account.id}
              >
                <td className="py-3 pr-3">
                  <p className="font-bold text-[#3D291F]">
                    {account.fullName}
                    {isSelf ? (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#174C37]">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[#7A685D]">@{account.username}</p>
                </td>
                <td className="py-3 pr-3">
                  {isDisabled ? (
                    <span className="font-semibold text-[#963B32]">
                      Disabled since {formatStaffTimestamp(account.disabledAt)}
                    </span>
                  ) : (
                    <span className="font-semibold text-[#174C37]">
                      Enabled
                    </span>
                  )}
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">
                  {formatStaffTimestamp(account.createdAt)}
                </td>
                <td className="py-3">
                  {isSelf || lastActiveStaff ? (
                    <p className="text-[#7A685D]">
                      {isSelf
                        ? "Staff cannot change their own access."
                        : "The last active staff account cannot be disabled."}
                    </p>
                  ) : (
                    <StaffActionDialog
                      action={setStaffDisabledAction}
                      confirmLabel={
                        isDisabled ? "Re-enable account" : "Disable account"
                      }
                      danger={!isDisabled}
                      description={
                        isDisabled
                          ? "The account regains access to the staff panel immediately."
                          : "The account loses staff access immediately and cannot sign in until it is re-enabled. Membership data is unchanged."
                      }
                      fields={{
                        staff_id: account.id,
                        disabled: isDisabled ? "false" : "true",
                      }}
                      reasonLabel={
                        isDisabled
                          ? "Reason for re-enabling"
                          : "Reason for disabling"
                      }
                      title={
                        isDisabled
                          ? `Re-enable ${account.fullName}?`
                          : `Disable ${account.fullName}?`
                      }
                      triggerLabel={isDisabled ? "Re-enable" : "Disable"}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
