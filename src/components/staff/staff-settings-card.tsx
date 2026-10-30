"use client";

import { useState } from "react";

export interface StaffPaymentSettings {
  bankName: string;
  accountNumber: string;
  accountName: string;
  instructions: string | null;
  updatedAt: string;
}

export interface StaffAttendanceSettings {
  lateAfterMinutes: number;
  changedAt: string;
}

function maskAccountNumber(accountNumber: string) {
  return `•••• •••• ${accountNumber.slice(-2)}`;
}

export default function StaffSettingsCard({
  paymentSettings,
  attendance,
  attendanceLabel,
  paymentLabel,
}: {
  paymentSettings: StaffPaymentSettings | null;
  attendance: StaffAttendanceSettings | null;
  attendanceLabel: string;
  paymentLabel: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-[#3D291F]">
          Club payment details
        </h2>
        {paymentSettings ? (
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                Bank
              </dt>
              <dd className="font-semibold text-[#3D291F]">
                {paymentSettings.bankName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                Account number
              </dt>
              <dd className="flex flex-wrap items-center gap-2 font-semibold text-[#3D291F]">
                <span>
                  {revealed
                    ? paymentSettings.accountNumber
                    : maskAccountNumber(paymentSettings.accountNumber)}
                </span>
                <button
                  className="button-secondary"
                  onClick={() => setRevealed((current) => !current)}
                  type="button"
                >
                  {revealed ? "Hide" : "Reveal"}
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                Account name
              </dt>
              <dd className="font-semibold text-[#3D291F]">
                {paymentSettings.accountName}
              </dd>
            </div>
            {paymentSettings.instructions ? (
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                  Instructions
                </dt>
                <dd className="text-[#5C4638]">
                  {paymentSettings.instructions}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                Last updated
              </dt>
              <dd className="text-[#5C4638]">{paymentLabel}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-[#7A685D]">
            No payment details have been configured.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#E5DDD3] bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-[#3D291F]">
          Attendance and onboarding
        </h2>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
              Late arrival threshold
            </dt>
            <dd className="font-semibold text-[#3D291F]">
              {attendance
                ? `${attendance.lateAfterMinutes} minutes after the session opens`
                : "Not configured"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
              Last changed
            </dt>
            <dd className="text-[#5C4638]">{attendanceLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
              Financial onboarding
            </dt>
            <dd className="text-[#5C4638]">
              {paymentSettings
                ? "Payment details are in place, so members can settle dues from the portal."
                : "Incomplete. Members cannot see how to pay dues until the President saves club payment details."}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-[#7A685D]">
          Settings are read-only here. The President records club finance and
          updates these values from the officer workspace.
        </p>
      </section>
    </div>
  );
}
