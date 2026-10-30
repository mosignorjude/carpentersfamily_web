import StaffSettingsCard from "@/components/staff/staff-settings-card";
import { requireStaffProfile } from "@/lib/staff-access.server";
import { loadPresident } from "@/lib/staff-panel.server";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";

export default async function StaffSettingsPage() {
  const { supabase } = await requireStaffProfile();

  const [paymentResult, attendanceResult, president] = await Promise.all([
    supabase
      .from("club_payment_settings")
      .select(
        "bank_name, account_number, account_name, instructions, updated_at",
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("club_attendance_settings")
      .select("default_late_after_minutes, changed_at")
      .limit(1)
      .maybeSingle(),
    loadPresident(supabase),
  ]);

  const payment = paymentResult.data;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
          Staff administration
        </p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F]">
          Club settings
        </h1>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-[#7A685D]">
          Current club configuration. President:{" "}
          {president ? president.fullName : "Vacant"}. Values are read-only for
          staff administrators.
        </p>
      </section>

      {paymentResult.error || attendanceResult.error ? (
        <p
          className="rounded-xl border border-[#E5C5C1] bg-[#FAF0EE] p-4 text-xs font-semibold text-[#76342D]"
          role="alert"
        >
          Some club settings could not be loaded. Refresh the page and try
          again.
        </p>
      ) : (
        <StaffSettingsCard
          attendance={
            attendanceResult.data
              ? {
                  lateAfterMinutes:
                    attendanceResult.data.default_late_after_minutes,
                  changedAt: attendanceResult.data.changed_at,
                }
              : null
          }
          attendanceLabel={
            attendanceResult.data
              ? formatStaffTimestamp(attendanceResult.data.changed_at)
              : "—"
          }
          paymentSettings={
            payment
              ? {
                  bankName: payment.bank_name,
                  accountNumber: payment.account_number,
                  accountName: payment.account_name,
                  instructions: payment.instructions,
                  updatedAt: payment.updated_at,
                }
              : null
          }
          paymentLabel={
            payment ? formatStaffTimestamp(payment.updated_at) : "—"
          }
        />
      )}
    </div>
  );
}
