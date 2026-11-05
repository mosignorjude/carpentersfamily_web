"use client";

import { useActionState } from "react";
import { submitPartnershipEnquiryAction } from "@/app/actions";
import {
  MODAL_INPUT,
  ModalField,
  ModalShell,
  ModalSubmit,
} from "./modal-shell";

interface PartnershipEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PartnershipEnquiryModal({
  isOpen,
  onClose,
}: PartnershipEnquiryModalProps) {
  if (!isOpen) return null;

  return <PartnershipEnquiryForm onClose={onClose} />;
}

// Closing unmounts the form, so a refusal cannot survive its dialog and reopen over empty fields.
function PartnershipEnquiryForm({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState(
    submitPartnershipEnquiryAction,
    null,
  );

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      titleId="partner-modal-title"
      eyebrow="Entertainment & Brand Powerhouse"
      title="Partner With Carpenters Family"
      notice={state ?? undefined}
    >
      <p className="mt-2 text-xs text-umber leading-relaxed">
        Book our DJs, hype men/MCs, and event hosts, or partner with us for
        drinks and lifestyle brand activations across Delta State.
      </p>

      <form action={formAction} className="mt-4 space-y-3 text-sm">
        <ModalField label="Organization Name" htmlFor="partner-org-name">
          <input
            id="partner-org-name"
            required
            type="text"
            name="organization_name"
            defaultValue={state?.values.organization_name}
            autoComplete="organization"
            placeholder="Brand, client or company"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Contact Name" htmlFor="partner-contact-name">
          <input
            id="partner-contact-name"
            required
            type="text"
            name="contact_name"
            defaultValue={state?.values.contact_name}
            autoComplete="name"
            placeholder="Your full name"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Email Address" htmlFor="partner-email">
          <input
            id="partner-email"
            required
            type="email"
            name="email"
            defaultValue={state?.values.email}
            autoComplete="email"
            placeholder="you@example.com"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Phone / WhatsApp Number" htmlFor="partner-phone">
          <input
            id="partner-phone"
            required
            type="tel"
            name="phone"
            defaultValue={state?.values.phone}
            autoComplete="tel"
            placeholder="+234 800 000 0000"
            className={MODAL_INPUT}
          />
        </ModalField>

        <ModalField label="Enquiry Type" htmlFor="partner-type">
          {/* Remounted on refusal: React applies a select's defaultValue only at mount. */}
          <select
            key={state?.values.enquiry_type ?? "enquiry-type"}
            id="partner-type"
            required
            name="enquiry_type"
            defaultValue={state?.values.enquiry_type}
            className={MODAL_INPUT}
          >
            <option value="brand_activation">
              Drinks &amp; Product Promotion at Events
            </option>
            <option value="corporate_booking">
              Book DJ / Hype Man / MC &amp; Crowd Engagement
            </option>
            <option value="sponsorship">
              Event Sponsorship (flagship shows &amp; raves)
            </option>
            <option value="general">Full Event Hosting &amp; Management</option>
          </select>
        </ModalField>

        <ModalField label="Proposal / Message" htmlFor="partner-message">
          <textarea
            id="partner-message"
            required
            rows={3}
            name="message"
            defaultValue={state?.values.message}
            placeholder="Brand goals, event dates, or the services you need."
            className={`${MODAL_INPUT} resize-none`}
          />
        </ModalField>

        <div className="flex gap-2 pt-2">
          <ModalSubmit className="bg-ochre text-deep hover:bg-forest hover:text-cream">
            Send Partnership Inquiry
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
