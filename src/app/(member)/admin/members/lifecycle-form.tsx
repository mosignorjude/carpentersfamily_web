"use client";

import { memberLifecycleAction } from "@/app/actions";

type LifecycleFormProps = {
  memberId: string;
  memberName: string;
  operation: "approve" | "deactivate" | "reactivate";
  label: string;
};

export default function LifecycleForm({
  memberId,
  memberName,
  operation,
  label,
}: LifecycleFormProps) {
  const confirmation = {
    approve: `Approve ${memberName}'s membership and enable member access? The account must have a completed profile and confirmed email.`,
    deactivate: `Deactivate ${memberName}? Their application access will be blocked immediately.`,
    reactivate: `Reactivate ${memberName}? Their previous role assignments will become effective again.`,
  }[operation];

  return (
    <form
      action={memberLifecycleAction}
      className="lifecycle-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />
      <input name="operation" type="hidden" value={operation} />
      <label htmlFor={`lifecycle-reason-${memberId}`}>
        Reason for this change
        <input
          aria-describedby={`lifecycle-reason-help-${memberId}`}
          autoComplete="off"
          id={`lifecycle-reason-${memberId}`}
          maxLength={500}
          name="reason"
          required
        />
      </label>
      <p
        className="muted lifecycle-reason-help"
        id={`lifecycle-reason-help-${memberId}`}
      >
        Required. This reason is included in the member status audit history.
      </p>
      <button
        aria-label={`${label}: ${memberName}`}
        className={
          operation === "deactivate" ? "button-danger" : "button-secondary"
        }
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}
