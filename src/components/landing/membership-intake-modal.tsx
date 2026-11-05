"use client";

import { useActionState } from "react";
import { submitMembershipRequestAction } from "@/app/actions";
import {
  MODAL_INPUT,
  ModalField,
  ModalShell,
  ModalSubmit,
} from "./modal-shell";

interface MembershipIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MembershipIntakeModal({
  isOpen,
  onClose,
}: MembershipIntakeModalProps) {
  if (!isOpen) return null;

  return <MembershipIntakeForm onClose={onClose} />;
}

// Closing unmounts the form, so a refusal cannot survive its dialog and reopen over empty fields.
function MembershipIntakeForm({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState(
    submitMembershipRequestAction,
    null,
  );

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      titleId="membership-modal-title"
      eyebrow="By Invitation & Vetted Merit"
      title="Request Membership Introduction"
      notice={state ?? undefined}
    >
      <p className="mt-2 text-xs leading-relaxed text-umber">
        Prospective members must be recommended by an active financial member
        and complete a 3-month probationary vetting period.
      </p>

      <form action={formAction} className="mt-4 space-y-3 text-sm">
        <ModalField label="Full Name" htmlFor="intake-full-name">
          <input
            id="intake-full-name"
            required
            type="text"
            name="full_name"
            defaultValue={state?.values.full_name}
            autoComplete="name"
            placeholder="As it appears on your ID"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Email Address" htmlFor="intake-email">
          <input
            id="intake-email"
            required
            type="email"
            name="email"
            defaultValue={state?.values.email}
            autoComplete="email"
            placeholder="you@example.com"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Phone / WhatsApp Number" htmlFor="intake-phone">
          <input
            id="intake-phone"
            required
            type="tel"
            name="phone"
            defaultValue={state?.values.phone}
            autoComplete="tel"
            placeholder="+234 800 000 0000"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Profession / Occupation" htmlFor="intake-profession">
          <input
            id="intake-profession"
            required
            type="text"
            name="profession"
            defaultValue={state?.values.profession}
            placeholder="What you do for a living"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField
          label="Reason for Joining & Referring Member"
          htmlFor="intake-reason"
        >
          <textarea
            id="intake-reason"
            required
            rows={3}
            name="reason_for_joining"
            defaultValue={state?.values.reason_for_joining}
            placeholder="Why you wish to join, and the name of any referring member."
            className={`${MODAL_INPUT} resize-none`}
          />
        </ModalField>

        <div className="flex gap-2 pt-2">
          <ModalSubmit className="bg-forest text-cream hover:bg-ochre hover:text-deep">
            Submit to Secretariat
          </ModalSubmit>
          <button
            type="button"
            onClick={onClose}
            className="btn border border-linen bg-white text-espresso text-xs font-bold hover:bg-linen/40 transition-colors"
          >
            Close
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
