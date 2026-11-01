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
    <div className="space-y-4">
      {/* Mobile Card View (screens < 640px) */}
      <div className="block sm:hidden space-y-3">
        {accounts.map((account) => {
          const isSelf = account.id === currentUserId;
          const isDisabled = account.disabledAt !== null;
          const lastActiveStaff = !isDisabled && activeStaffCount <= 1;

          return (
            <div
              className="rounded-xl border border-linen bg-white p-4 shadow-2xs space-y-3"
              key={account.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-espresso">
                    {account.fullName}
                    {isSelf ? (
                      <span className="ml-2 inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-forest">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">@{account.username}</p>
                </div>
                <div>
                  {isDisabled ? (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-terracotta">
                      Disabled
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-forest">
                      Enabled
                    </span>
                  )}
                </div>
              </div>

              <div className="border-y border-linen/60 py-2 text-xs text-body">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted mr-1.5">
                  Created:
                </span>
                {formatStaffTimestamp(account.createdAt)}
                {isDisabled ? (
                  <p className="mt-1 text-[11px] text-terracotta font-medium">
                    Disabled since {formatStaffTimestamp(account.disabledAt)}
                  </p>
                ) : null}
              </div>

              <div className="pt-1">
                {isSelf || lastActiveStaff ? (
                  <p className="text-xs text-muted italic">
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (screens >= 640px) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
          <caption className="sr-only">
            Staff administrator accounts roster
          </caption>
          <thead>
            <tr className="border-b border-linen text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Staff member
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Access
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Created
              </th>
              <th className="py-2.5 font-bold" scope="col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const isSelf = account.id === currentUserId;
              const isDisabled = account.disabledAt !== null;
              const lastActiveStaff = !isDisabled && activeStaffCount <= 1;
              return (
                <tr
                  className="border-b border-linen/60 align-top hover:bg-warm-canvas/40"
                  key={account.id}
                >
                  <th className="py-3 pr-3 text-left font-normal" scope="row">
                    <p className="font-bold text-espresso">
                      {account.fullName}
                      {isSelf ? (
                        <span className="ml-2 inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-forest">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted">@{account.username}</p>
                  </th>
                  <td className="py-3 pr-3">
                    {isDisabled ? (
                      <span className="font-semibold text-terracotta">
                        Disabled since{" "}
                        {formatStaffTimestamp(account.disabledAt)}
                      </span>
                    ) : (
                      <span className="font-semibold text-forest">Enabled</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-body">
                    {formatStaffTimestamp(account.createdAt)}
                  </td>
                  <td className="py-3">
                    {isSelf || lastActiveStaff ? (
                      <p className="text-muted">
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
    </div>
  );
}
