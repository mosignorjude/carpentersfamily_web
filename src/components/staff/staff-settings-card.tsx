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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!paymentSettings?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(paymentSettings.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in unsupported environments
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-linen bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-espresso">
          Club payment details
        </h2>
        {paymentSettings ? (
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Bank
              </dt>
              <dd className="font-semibold text-espresso">
                {paymentSettings.bankName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Account number
              </dt>
              <dd className="flex flex-wrap items-center gap-2 font-semibold text-espresso">
                <span>
                  {revealed
                    ? paymentSettings.accountNumber
                    : maskAccountNumber(paymentSettings.accountNumber)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="button-secondary min-h-11 sm:min-h-9 px-3 text-xs"
                    onClick={() => setRevealed((current) => !current)}
                    type="button"
                    aria-label={
                      revealed
                        ? "Hide full account number"
                        : "Reveal full account number"
                    }
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </button>
                  <button
                    className="button-secondary min-h-11 sm:min-h-9 px-3 text-xs"
                    onClick={handleCopy}
                    type="button"
                    aria-label="Copy account number to clipboard"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Account name
              </dt>
              <dd className="font-semibold text-espresso">
                {paymentSettings.accountName}
              </dd>
            </div>
            {paymentSettings.instructions ? (
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Instructions
                </dt>
                <dd className="text-body">{paymentSettings.instructions}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Last updated
              </dt>
              <dd className="text-body">{paymentLabel}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-muted">
            No payment details have been configured.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-linen bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-espresso">
          Attendance and onboarding
        </h2>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Late arrival threshold
            </dt>
            <dd className="font-semibold text-espresso">
              {attendance
                ? `${attendance.lateAfterMinutes} minutes after the session opens`
                : "Not configured"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Last changed
            </dt>
            <dd className="text-body">{attendanceLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Financial onboarding
            </dt>
            <dd className="text-body">
              {paymentSettings
                ? "Payment details are in place, so members can settle dues from the portal."
                : "Incomplete. Members cannot see how to pay dues until the President saves club payment details."}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted">
          Settings are read-only here. The President records club finance and
          updates these values from the officer workspace.
        </p>
      </section>
    </div>
  );
}
