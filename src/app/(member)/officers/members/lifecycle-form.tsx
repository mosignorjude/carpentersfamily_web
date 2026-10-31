"use client";

import { useId, useRef } from "react";
import { memberLifecycleAction } from "@/app/actions";

type LifecycleOperation = "approve" | "reject" | "deactivate" | "reactivate";

type LifecycleFormProps = {
  memberId: string;
  memberName: string;
  operation: LifecycleOperation;
  label: string;
};

export default function LifecycleForm({
  memberId,
  memberName,
  operation,
  label,
}: LifecycleFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();

  if (operation !== "approve") {
    const dialogCopy = {
      reject: {
        eyebrow: "Membership request",
        title: `Reject ${memberName}'s request?`,
        description:
          "The member will not be given access. Enter a reason for the audit history, then confirm the rejection.",
        reasonLabel: "Reason for rejection",
        reasonHelp:
          "Required. This reason is recorded in the member audit history.",
        confirmLabel: "Confirm rejection",
        buttonClass: "button-danger",
      },
      deactivate: {
        eyebrow: "Member access",
        title: `Deactivate ${memberName}?`,
        description:
          "Their access will be blocked immediately. Enter a reason and confirm to deactivate this account.",
        reasonLabel: "Reason for deactivation",
        reasonHelp:
          "Required. This reason is recorded in the member audit history.",
        confirmLabel: "Confirm deactivation",
        buttonClass: "button-danger",
      },
      reactivate: {
        eyebrow: "Member access",
        title: `Reactivate ${memberName}?`,
        description:
          "Their previous role assignments will become effective again. Enter a reason and confirm to reactivate this account.",
        reasonLabel: "Reason for reactivation",
        reasonHelp:
          "Required. This reason is recorded in the member audit history.",
        confirmLabel: "Confirm reactivation",
        buttonClass: "button-secondary",
      },
    }[operation];
    const reasonId = `lifecycle-reason-${id}`;
    const reasonHelpId = `lifecycle-reason-help-${id}`;

    return (
      <>
        <button
          aria-label={`${label}: ${memberName}`}
          className={dialogCopy.buttonClass}
          onClick={() => dialogRef.current?.showModal()}
          type="button"
        >
          {label}
        </button>
        <dialog
          aria-labelledby={`lifecycle-dialog-title-${id}`}
          className="member-role-dialog"
          ref={dialogRef}
        >
          <form
            action={memberLifecycleAction}
            className="member-role-dialog-form"
            onSubmit={(event) => {
              const reasonField =
                event.currentTarget.elements.namedItem("reason");
              if (
                reasonField instanceof HTMLTextAreaElement &&
                !reasonField.value.trim()
              ) {
                reasonField.setCustomValidity(
                  "Enter a reason for rejecting this request.",
                );
                reasonField.reportValidity();
                event.preventDefault();
                return;
              }
              if (reasonField instanceof HTMLTextAreaElement) {
                reasonField.setCustomValidity("");
              }
              if (
                reasonField instanceof HTMLInputElement &&
                !reasonField.value.trim()
              ) {
                reasonField.setCustomValidity(
                  "Enter a reason for this change.",
                );
                reasonField.reportValidity();
                event.preventDefault();
                return;
              }
              if (reasonField instanceof HTMLInputElement) {
                reasonField.setCustomValidity("");
              }
            }}
          >
            <input name="member_id" type="hidden" value={memberId} />
            <input name="operation" type="hidden" value={operation} />
            <div>
              <p className="eyebrow">{dialogCopy.eyebrow}</p>
              <h2 id={`lifecycle-dialog-title-${id}`}>{dialogCopy.title}</h2>
              <p>{dialogCopy.description}</p>
            </div>
            <label htmlFor={reasonId}>
              {dialogCopy.reasonLabel}
              {operation === "reject" ? (
                <textarea
                  aria-describedby={reasonHelpId}
                  autoComplete="off"
                  id={reasonId}
                  maxLength={500}
                  name="reason"
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  required
                  rows={4}
                />
              ) : (
                <input
                  aria-describedby={reasonHelpId}
                  autoComplete="off"
                  id={reasonId}
                  maxLength={500}
                  name="reason"
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                  required
                />
              )}
            </label>
            <p className="muted lifecycle-reason-help" id={reasonHelpId}>
              {dialogCopy.reasonHelp}
            </p>
            <div className="member-role-dialog-actions">
              <button
                className="button-secondary"
                onClick={() => dialogRef.current?.close()}
                type="button"
              >
                Cancel
              </button>
              <button className={dialogCopy.buttonClass} type="submit">
                {dialogCopy.confirmLabel}
              </button>
            </div>
          </form>
        </dialog>
      </>
    );
  }

  return (
    <form
      action={memberLifecycleAction}
      className="lifecycle-form"
      onSubmit={(event) => {
        const confirmation = `Approve ${memberName}'s membership and enable member access? The account must have a completed profile and confirmed email.`;
        if (!window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />
      <input name="operation" type="hidden" value={operation} />
      <button
        aria-label={`${label}: ${memberName}`}
        className="button-secondary"
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}
