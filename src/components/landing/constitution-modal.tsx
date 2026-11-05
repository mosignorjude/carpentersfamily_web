"use client";

import { useEffect, useRef } from "react";

interface ConstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConstitutionModal({ isOpen, onClose }: ConstitutionModalProps) {
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
      aria-labelledby="constitution-modal-title"
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
        className="relative z-10 w-full max-w-lg rounded-2xl bg-cream p-6 shadow-2xl border border-linen animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-terra">
              Governance &amp; By-Laws
            </span>
            <h3
              id="constitution-modal-title"
              className="font-serif text-2xl font-bold text-espresso"
            >
              Constitution Highlights
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

        <ul className="mt-4 space-y-2.5 text-xs sm:text-sm text-body">
          <li className="p-3 rounded-xl bg-white border border-linen">
            <strong className="text-espresso">Purpose:</strong> Event
            management, DJ/MC/hype services, beverage and brand promotion, and
            mutual family welfare in Asaba and across Delta State.
          </li>
          <li className="p-3 rounded-xl bg-white border border-linen">
            <strong className="text-espresso">Executive Council:</strong> Led by
            the Chairman, Secretary General, Provost/Welfare, and
            Treasurer/Financial Secretary serving 2-year terms.
          </li>
          <li className="p-3 rounded-xl bg-white border border-linen">
            <strong className="text-espresso">Regular Meetings:</strong> Held on
            the last Sunday of every month at 4:00 PM prompt in Asaba.
          </li>
          <li className="p-3 rounded-xl bg-white border border-linen">
            <strong className="text-espresso">
              Stewardship &amp; Welfare:
            </strong>{" "}
            Dual-signatory bank authorization, open books, transparent
            accounting, and standing support for active members during weddings,
            childbirth, and life milestones.
          </li>
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="btn mt-5 w-full bg-forest text-cream text-xs font-bold hover:bg-ochre hover:text-deep transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
