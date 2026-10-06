"use client";

import {
  correctDuesPaymentAction,
  recordDuesPaymentAction,
  setDuesRateAction,
  writeOffDuesAction,
} from "@/app/actions";

export type DuesMonthOption = {
  month: string;
  amount: string | number | null;
  label: string;
};

export type DuesMemberOption = {
  id: string;
  full_name: string;
  username: string;
  status: string;
};

export type PaymentCorrection = {
  id: string;
  member_id: string;
  amount_ngn: string | number;
  payment_date: string;
  covered_months: string[];
};

function displayAmount(amount: string | number | null) {
  if (amount === null) return "rate unavailable";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function DuesPaymentForm({
  memberId,
  availableMonths,
  today,
}: {
  memberId: string;
  availableMonths: DuesMonthOption[];
  today: string;
}) {
  return (
    <form action={recordDuesPaymentAction} className="form-stack dues-form">
      <input name="member_id" type="hidden" value={memberId} />
      {availableMonths.length > 0 ? (
        <label>
          Unpaid months to cover
          <select
            multiple
            name="covered_month"
            size={Math.min(8, availableMonths.length)}
          >
            {availableMonths.map((option) => (
              <option key={option.month} value={option.month.slice(0, 7)}>
                {option.label} · {displayAmount(option.amount)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div>
          <span className="field-label">Unpaid months to cover</span>
          <span className="muted">
            There are no unpaid months in the current schedule.
          </span>
        </div>
      )}
      <label>
        Additional future months, if needed
        <input
          autoComplete="off"
          maxLength={10000}
          name="prepay_months"
          placeholder="YYYY-MM, YYYY-MM"
        />
      </label>
      <p className="muted">
        Select full months or enter additional future months. The database
        checks the exact total against each month’s configured rate; partial
        payments are rejected.
      </p>
      <label>
        Exact payment amount in whole Naira
        <input
          inputMode="numeric"
          max="1200000000000"
          min="1"
          name="amount_ngn"
          pattern="[0-9]+"
          required
          step="1"
          type="number"
        />
      </label>
      <label>
        Payment date
        <input max={today} name="payment_date" required type="date" />
      </label>
      <button type="submit">Record dues payment</button>
    </form>
  );
}

export function DuesWriteOffForm({
  memberId,
  memberName,
  pastUnpaidMonths,
}: {
  memberId: string;
  memberName: string;
  pastUnpaidMonths: DuesMonthOption[];
}) {
  if (pastUnpaidMonths.length === 0) {
    return (
      <p className="muted">No old unpaid months are eligible for write-off.</p>
    );
  }

  return (
    <form
      action={writeOffDuesAction}
      className="form-stack dues-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Write off the selected full dues months for ${memberName}? This is a final financial disposition.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />
      <label>
        Old unpaid months to write off
        <select
          multiple
          name="covered_month"
          required
          size={Math.min(8, pastUnpaidMonths.length)}
        >
          {pastUnpaidMonths.map((option) => (
            <option key={option.month} value={option.month.slice(0, 7)}>
              {option.label} · {displayAmount(option.amount)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Required reason
        <input autoComplete="off" maxLength={500} name="reason" required />
      </label>
      <button className="button-secondary" type="submit">
        Write off selected months
      </button>
    </form>
  );
}

export function DuesPaymentCorrectionForm({
  payment,
  members,
}: {
  payment: PaymentCorrection;
  members: DuesMemberOption[];
}) {
  return (
    <details className="dues-correction">
      <summary>Correct this payment</summary>
      <form
        action={correctDuesPaymentAction}
        className="form-stack dues-form"
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Save this payment correction? The previous coverage will remain in the audit history.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="payment_id" type="hidden" value={payment.id} />
        <label>
          Member
          <select defaultValue={payment.member_id} name="member_id" required>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name} · @{member.username} · {member.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Corrected covered months, comma-separated
          <input
            autoComplete="off"
            defaultValue={payment.covered_months
              .map((month) => month.slice(0, 7))
              .join(", ")}
            maxLength={10000}
            name="covered_months"
            required
          />
        </label>
        <label>
          Corrected amount in whole Naira
          <input
            defaultValue={payment.amount_ngn}
            inputMode="numeric"
            max="1200000000000"
            min="1"
            name="amount_ngn"
            pattern="[0-9]+"
            required
            step="1"
            type="number"
          />
        </label>
        <label>
          Corrected payment date
          <input
            defaultValue={payment.payment_date}
            name="payment_date"
            required
            type="date"
          />
        </label>
        <label>
          Required correction reason
          <input autoComplete="off" maxLength={500} name="reason" required />
        </label>
        <button className="button-secondary" type="submit">
          Save correction
        </button>
      </form>
    </details>
  );
}

export function DuesRateForm({ nextMonth }: { nextMonth: string }) {
  return (
    <form
      action={setDuesRateAction}
      className="form-stack dues-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Set a new monthly dues rate effective ${nextMonth}? Any already-paid future months keep their recorded rate.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <label>
        Effective month (next month only)
        <input
          defaultValue={nextMonth}
          name="effective_month"
          required
          type="month"
        />
      </label>
      <label>
        New monthly rate in whole Naira
        <input
          inputMode="numeric"
          max="1000000000"
          min="1"
          name="amount_ngn"
          pattern="[0-9]+"
          required
          step="1"
          type="number"
        />
      </label>
      <label>
        Required reason
        <input autoComplete="off" maxLength={500} name="reason" required />
      </label>
      <button className="button-secondary" type="submit">
        Schedule dues rate
      </button>
    </form>
  );
}
