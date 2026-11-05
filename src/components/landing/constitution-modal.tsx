"use client";

import { ModalShell } from "./modal-shell";

interface ConstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConstitutionModal({ isOpen, onClose }: ConstitutionModalProps) {
  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      wide
      titleId="constitution-modal-title"
      eyebrow="Governance & By-Laws"
      title="Constitution Highlights"
    >
      <ul className="mt-4 space-y-2.5 text-sm text-espresso">
        <li className="p-3 rounded-xl bg-white border border-linen">
          <strong className="text-espresso">Purpose:</strong> Event management,
          DJ/MC/hype services, drinks and brand promotion, and mutual family
          welfare in Asaba and across Delta State.
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
          <strong className="text-espresso">Stewardship &amp; Welfare:</strong>{" "}
          Dual-signatory bank authorization, open books, transparent accounting,
          and standing support for active members during weddings, childbirth,
          and life milestones.
        </li>
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="btn mt-5 w-full bg-forest text-xs font-bold text-cream transition-colors hover:bg-ochre hover:text-deep"
      >
        Close
      </button>
    </ModalShell>
  );
}
