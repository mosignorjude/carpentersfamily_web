"use client";

import { useActionState, useEffect, useState } from "react";
import {
  checkInEventAttendanceAction,
  issueEventAttendanceQrAction,
} from "@/app/actions";

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
}: {
  eventId: string;
  sessionOpen: boolean;
  alreadyCheckedIn: boolean;
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
    return <p className="muted">Your attendance has already been recorded.</p>;
  }
  if (!sessionOpen) {
    return <p className="muted">Check-in is closed for this event.</p>;
  }

  return (
    <form action={checkInEventAttendanceAction} className="event-form">
      <input name="event_id" type="hidden" value={eventId} />
      {qrToken ? (
        <>
          <input name="qr_token" type="hidden" value={qrToken} />
          <p className="muted">This page was opened from an event QR code.</p>
        </>
      ) : null}
      <button className="button-primary" type="submit">
        {qrToken ? "Confirm my QR check-in" : "Check me in"}
      </button>
    </form>
  );
}

export function AttendanceQrIssuer({ eventId }: { eventId: string }) {
  const [state, issueAction, pending] = useActionState(
    issueEventAttendanceQrAction,
    initialQrState,
  );

  return (
    <div className="attendance-qr">
      <form action={issueAction}>
        <input name="event_id" type="hidden" value={eventId} />
        <button className="button-secondary" disabled={pending} type="submit">
          {pending ? "Preparing QR…" : "Generate 90-second check-in QR"}
        </button>
      </form>
      {state.error ? (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.qrDataUrl && state.expiresAt ? (
        <figure>
          {/* biome-ignore lint/performance/noImgElement: Next/Image does not optimize this data URL and adds an inline style rejected by the production CSP. */}
          <img
            alt="Short-lived QR code for this attendance session"
            height={240}
            src={state.qrDataUrl}
            width={240}
          />
          <figcaption className="muted">
            Valid until {watDateTime.format(new Date(state.expiresAt))} WAT.
            Generate a new QR if it expires or is replaced.
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
