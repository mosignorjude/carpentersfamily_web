"use client";

import { type ReactNode, useId, useRef } from "react";
import { useFormStatus } from "react-dom";

export interface StaffActionDialogProps {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonHelp?: string;
  danger?: boolean;
  children?: ReactNode;
}

function StaffDialogSubmitButton({
  confirmLabel,
  danger,
}: {
  confirmLabel: string;
  danger: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={
        danger
          ? "button-danger inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          : "inline-flex min-h-11 items-center justify-center rounded-lg bg-forest px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      }
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Processing…
        </span>
      ) : (
        confirmLabel
      )}
    </button>
  );
}

export default function StaffActionDialog({
  action,
  fields = {},
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
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const id = useId();
  const reasonId = `staff-action-reason-${id}`;
  const titleId = `staff-action-title-${id}`;

  const openDialog = () => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const handleDialogClose = () => {
    previousFocusRef.current?.focus?.();
  };

  return (
    <>
      <button
        className={`${danger ? "button-danger" : "button-secondary"} inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 py-2 text-xs font-bold cursor-pointer`}
        onClick={openDialog}
        type="button"
      >
        {triggerLabel}
      </button>
      <dialog
        aria-labelledby={titleId}
        aria-modal="true"
        className="staff-dialog"
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            closeDialog();
          }
        }}
        onClose={handleDialogClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeDialog();
          }
        }}
        ref={dialogRef}
      >
        <form action={action} className="staff-dialog-form">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <div>
            <p className="eyebrow">Governance action</p>
            <h2 id={titleId}>{title}</h2>
            <p className="text-body text-xs sm:text-sm">{description}</p>
          </div>
          {children}
          <label htmlFor={reasonId}>
            {reasonLabel}
            <textarea
              aria-required="true"
              id={reasonId}
              maxLength={500}
              name="reason"
              required
              rows={3}
            />
          </label>
          <p className="muted text-xs">{reasonHelp}</p>
          <div className="staff-dialog-actions">
            <button
              className="button-secondary inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-xs font-bold cursor-pointer"
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <StaffDialogSubmitButton
              confirmLabel={confirmLabel}
              danger={danger}
            />
          </div>
        </form>
      </dialog>
    </>
  );
}
