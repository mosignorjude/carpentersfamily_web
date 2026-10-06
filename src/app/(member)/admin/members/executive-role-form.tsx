"use client";

import { executiveRoleAction } from "@/app/actions";

type ExecutiveRoleFormProps = {
  memberId: string;
  memberName: string;
  operation: "grant" | "revoke";
};

export default function ExecutiveRoleForm({
  memberId,
  memberName,
  operation,
}: ExecutiveRoleFormProps) {
  const isGrant = operation === "grant";
  const label = isGrant ? "Grant Executive status" : "Remove Executive status";
  const reasonId = `executive-role-reason-${memberId}`;
  const reasonHelpId = `executive-role-reason-help-${memberId}`;
  const confirmation = isGrant
    ? `Grant Executive status to ${memberName}? This gives the member Executive permissions and records the change in the audit history.`
    : `Remove Executive status from ${memberName}? This ends the member's Executive permissions and records the change in the audit history.`;

  return (
    <form
      action={executiveRoleAction}
      className="lifecycle-form executive-role-form"
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />
      <input name="operation" type="hidden" value={operation} />
      <input name="role" type="hidden" value="executive" />
      <label htmlFor={reasonId}>
        Reason for this role change
        <input
          aria-describedby={reasonHelpId}
          autoComplete="off"
          id={reasonId}
          maxLength={500}
          name="reason"
          required
        />
      </label>
      <p className="muted lifecycle-reason-help" id={reasonHelpId}>
        Required. This reason is included in the role audit history.
      </p>
      <button
        aria-label={`${label}: ${memberName}`}
        className={isGrant ? "button-secondary" : "button-danger"}
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}
