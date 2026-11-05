"use client";

import { useEffect, useRef } from "react";
import { submitPartnershipEnquiryAction } from "@/app/actions";

interface PartnershipEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PartnershipEnquiryModal({
  isOpen,
  onClose,
}: PartnershipEnquiryModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-modal-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-deep/60 backdrop-blur-xs cursor-default -z-10 border-0"
        aria-label="Close modal overlay"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl border border-linen animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-terra">
              Entertainment &amp; Brand Powerhouse
            </span>
            <h3
              id="partner-modal-title"
              className="font-serif text-2xl font-bold text-espresso"
            >
              Partner With Carpenters Family
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-linen grid place-items-center text-espresso hover:bg-linen/40 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs text-umber leading-relaxed">
          Book our DJs, hype men/MCs, and event hosts, or partner with us for
          drinks and lifestyle brand activations across Delta State.
        </p>

        <form
          action={submitPartnershipEnquiryAction}
          className="mt-4 space-y-3 text-sm"
        >
          <div>
            <label htmlFor="partner-org-name" className="sr-only">
              Organization Name
            </label>
            <input
              id="partner-org-name"
              required
              type="text"
              name="organization_name"
              placeholder="Brand / Organization / Client Name"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="partner-contact-name" className="sr-only">
              Contact Name
            </label>
            <input
              id="partner-contact-name"
              required
              type="text"
              name="contact_name"
              placeholder="Your Full Name / Representative"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="partner-email" className="sr-only">
              Email Address
            </label>
            <input
              id="partner-email"
              required
              type="email"
              name="email"
              placeholder="Contact Email Address"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="partner-phone" className="sr-only">
              Phone / WhatsApp Number
            </label>
            <input
              id="partner-phone"
              required
              type="tel"
              name="phone"
              placeholder="Contact Phone / WhatsApp Number"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="partner-type" className="sr-only">
              Enquiry Type
            </label>
            <select
              id="partner-type"
              required
              name="enquiry_type"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso focus:border-forest focus:outline-hidden"
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
              <option value="general">
                Full Event Hosting &amp; Management
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="partner-message" className="sr-only">
              Proposal / Message
            </label>
            <textarea
              id="partner-message"
              required
              rows={3}
              name="message"
              placeholder="Tell us about your brand goals, event dates, or requested services..."
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn flex-1 bg-ochre text-deep hover:bg-forest hover:text-cream text-xs font-bold transition-colors"
            >
              Send Partnership Inquiry
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn border border-linen bg-white text-espresso text-xs font-bold hover:bg-linen/40 transition-colors"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
