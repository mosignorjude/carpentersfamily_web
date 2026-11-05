"use client";

import { useEffect, useRef } from "react";
import { submitMembershipRequestAction } from "@/app/actions";

interface MembershipIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MembershipIntakeModal({
  isOpen,
  onClose,
}: MembershipIntakeModalProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="membership-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl border border-linen animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-terra">
              By Invitation &amp; Vetted Merit
            </span>
            <h3
              id="membership-modal-title"
              className="font-serif text-2xl font-bold text-espresso"
            >
              Request Membership Introduction
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
          Prospective members must be recommended by an active financial member and
          complete a 3-month probationary vetting period.
        </p>

        <form action={submitMembershipRequestAction} className="mt-4 space-y-3 text-sm">
          <div>
            <label htmlFor="intake-full-name" className="sr-only">
              Full Name
            </label>
            <input
              id="intake-full-name"
              required
              type="text"
              name="full_name"
              placeholder="Your Full Name"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="intake-email" className="sr-only">
              Email Address
            </label>
            <input
              id="intake-email"
              required
              type="email"
              name="email"
              placeholder="Email Address"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="intake-phone" className="sr-only">
              Phone / WhatsApp Number
            </label>
            <input
              id="intake-phone"
              required
              type="tel"
              name="phone"
              placeholder="Phone / WhatsApp Number (e.g. +234...)"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="intake-profession" className="sr-only">
              Profession / Occupation
            </label>
            <input
              id="intake-profession"
              required
              type="text"
              name="profession"
              placeholder="Profession / Occupation"
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="intake-reason" className="sr-only">
              Reason for Joining & Referring Member
            </label>
            <textarea
              id="intake-reason"
              required
              rows={3}
              name="reason_for_joining"
              placeholder="Why do you wish to join? Include referring member name if any."
              className="w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/60 focus:border-forest focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn flex-1 bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
            >
              Submit to Secretariat
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
