"use client";

import { type ReactNode, useId, useRef } from "react";

export interface StaffActionDialogProps {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonHelp?: string;
  danger?: boolean;
  children?: ReactNode;
}

export default function StaffActionDialog({
  action,
  fields,
  triggerLabel,
  title,
  description,
  confirmLabel,
  reasonLabel = "Reason",
  reasonHelp = "Required. This reason is recorded in the governance audit history.",
  danger = false,
  children,
}: StaffActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const reasonId = `staff-action-reason-${id}`;
  const titleId = `staff-action-title-${id}`;

  return (
    <>
      <button
        className={danger ? "button-danger" : "button-secondary"}
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {triggerLabel}
      </button>
      <dialog
        aria-labelledby={titleId}
        className="staff-dialog"
        ref={dialogRef}
      >
        <form action={action} className="staff-dialog-form">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <div>
            <p className="eyebrow">Governance action</p>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
          <label htmlFor={reasonId}>
            {reasonLabel}
            <textarea
              id={reasonId}
              maxLength={500}
              name="reason"
              required
              rows={3}
            />
          </label>
          <p className="muted">{reasonHelp}</p>
          <div className="staff-dialog-actions">
            <button
              className="button-secondary"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className={danger ? "button-danger" : "button-secondary"}
              type="submit"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
