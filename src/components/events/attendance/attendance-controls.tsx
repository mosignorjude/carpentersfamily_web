"use client";

import { CheckCircle2, Clock, QrCode } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  checkInEventAttendanceAction,
  issueEventAttendanceQrAction,
} from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";

const initialQrState = {
  qrDataUrl: null,
  expiresAt: null,
  error: null,
};

const watDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AttendanceCheckIn({
  eventId,
  sessionOpen,
  alreadyCheckedIn,
  returnTo,
}: {
  eventId: string;
  sessionOpen: boolean;
  alreadyCheckedIn: boolean;
  returnTo?: string;
}) {
  const [qrToken, setQrToken] = useState("");

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const token = new URLSearchParams(hash).get("checkin") ?? "";
    if (!/^[0-9a-f]{64}$/.test(token)) return;
    setQrToken(token);
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  if (alreadyCheckedIn) {
    return (
      <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-xs font-semibold text-[#174C37] flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[#174C37] shrink-0" />
        <span>Your attendance has already been recorded for this event.</span>
      </div>
    );
  }
  if (!sessionOpen) {
    return (
      <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs font-medium text-[#7A685D] flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#7A685D] shrink-0" />
        <span>Check-in is currently closed for this event session.</span>
      </div>
    );
  }

  return (
    <form action={checkInEventAttendanceAction} className="space-y-3">
      <input name="event_id" type="hidden" value={eventId} />
      {returnTo && <input name="return_to" type="hidden" value={returnTo} />}
      {qrToken ? (
        <div className="p-3 rounded-xl bg-[#174C37]/10 border border-[#174C37]/30 text-xs text-[#174C37] font-semibold flex items-center gap-2">
          <QrCode className="w-4 h-4 text-[#D6A23A] shrink-0" />
          <span>QR Verification Token Detected</span>
          <input name="qr_token" type="hidden" value={qrToken} />
        </div>
      ) : null}
      <FormSubmitButton
        className="px-6 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[42px] flex items-center gap-2"
        pendingLabel="Recording Check-In…"
        statusToastMessage="Verifying and recording your event attendance."
      >
        <CheckCircle2 className="w-4 h-4 text-[#D6A23A]" />
        <span>
          {qrToken ? "Confirm My QR Check-In" : "Record My Attendance"}
        </span>
      </FormSubmitButton>
    </form>
  );
}

export function AttendanceQrIssuer({ eventId }: { eventId: string }) {
  const [state, issueAction, pending] = useActionState(
    issueEventAttendanceQrAction,
    initialQrState,
  );

  return (
    <div className="space-y-4">
      <form action={issueAction}>
        <input name="event_id" type="hidden" value={eventId} />
        <button
          className="px-4 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[40px] flex items-center gap-2 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          <QrCode className="w-4 h-4 text-[#D6A23A]" />
          <span>
            {pending ? "Generating QR…" : "Generate 90-Second Check-In QR"}
          </span>
        </button>
      </form>

      {state.error ? (
        <div
          className="p-3 rounded-xl bg-[#BA3C2A]/10 border border-[#BA3C2A]/30 text-xs font-semibold text-[#BA3C2A]"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      {state.qrDataUrl && state.expiresAt ? (
        <figure className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] inline-block text-center space-y-2">
          {/* biome-ignore lint/performance/noImgElement: Next/Image does not optimize this data URL and adds an inline style rejected by the production CSP. */}
          <img
            alt="Short-lived QR code for this attendance session"
            className="rounded-lg border border-[#E5DDD3] mx-auto bg-white p-2"
            height={220}
            src={state.qrDataUrl}
            width={220}
          />
          <figcaption className="text-[11px] font-mono text-[#7A685D] max-w-[220px] leading-snug">
            Valid until {watDateTime.format(new Date(state.expiresAt))} WAT.
            Regenerate when expired.
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
