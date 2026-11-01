"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createStaffAction } from "@/app/(staff)/admin/actions";

function SubmitInviteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-forest px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Sending invitation…
        </span>
      ) : (
        "Confirm & send invitation"
      )}
    </button>
  );
}

export default function StaffAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [candidate, setCandidate] = useState<{
    email: string;
    fullName: string;
    username: string;
  }>({ email: "", fullName: "", username: "" });

  const handleReviewClick = () => {
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    const formData = new FormData(formRef.current);
    setCandidate({
      email: String(formData.get("email") || ""),
      fullName: String(formData.get("full_name") || ""),
      username: String(formData.get("username") || ""),
    });
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
    <form
      action={createStaffAction}
      className="grid gap-3 sm:grid-cols-3"
      ref={formRef}
    >
      <label className="grid gap-1 text-xs font-bold text-espresso">
        Email address
        <input
          aria-required="true"
          className="min-h-11 rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso placeholder:text-muted focus-visible:border-forest focus-visible:outline-hidden"
          maxLength={254}
          name="email"
          placeholder="colleague@example.com"
          required
          type="email"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-espresso">
        Full name
        <input
          aria-required="true"
          className="min-h-11 rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso placeholder:text-muted focus-visible:border-forest focus-visible:outline-hidden"
          maxLength={120}
          name="full_name"
          placeholder="Dr. Ngozi Okonjo"
          required
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-espresso">
        Username
        <input
          aria-describedby="staff-username-hint"
          aria-required="true"
          className="min-h-11 rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso placeholder:text-muted focus-visible:border-forest focus-visible:outline-hidden"
          maxLength={30}
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9_]{3,30}"
          placeholder="ngozi_okonjo"
          required
        />
        <span
          className="text-[11px] font-normal text-muted"
          id="staff-username-hint"
        >
          3–30 letters, numbers, or underscores
        </span>
      </label>
      <div className="sm:col-span-3">
        <button
          className="button-secondary inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2.5 text-xs font-bold cursor-pointer"
          onClick={handleReviewClick}
          type="button"
        >
          Invite staff administrator
        </button>
      </div>

      <dialog
        aria-labelledby="staff-invite-modal-title"
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
        <div className="staff-dialog-form">
          <div>
            <p className="eyebrow">Governance action</p>
            <h2 id="staff-invite-modal-title">
              Invite {candidate.fullName || "new staff administrator"}?
            </h2>
            <p className="text-body text-xs sm:text-sm">
              They will receive a sign-in email at{" "}
              <strong className="text-espresso">{candidate.email}</strong> and
              full system administration access (@
              {candidate.username}) once provisioned.
            </p>
          </div>
          <div className="rounded-xl border border-linen bg-warm-canvas p-3.5 text-xs text-muted">
            Staff administrators can manage member accounts, appoint the
            President, and review all governance history.
          </div>
          <div className="staff-dialog-actions">
            <button
              className="button-secondary inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-xs font-bold cursor-pointer"
              onClick={closeDialog}
              type="button"
            >
              Cancel
            </button>
            <SubmitInviteButton />
          </div>
        </div>
      </dialog>
    </form>
  );
}
