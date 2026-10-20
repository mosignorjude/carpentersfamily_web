"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

export default function EventActionDialog({
  buttonLabel,
  title,
  children,
}: {
  buttonLabel: string;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className="button-secondary event-card-action"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {buttonLabel}
      </button>
      <dialog
        aria-labelledby={titleId}
        className="event-action-dialog"
        ref={dialogRef}
      >
        <header className="event-action-dialog-header">
          <h3 id={titleId}>{title}</h3>
          <button
            aria-label="Close dialog"
            className="button-secondary event-dialog-close"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="event-action-dialog-content">{children}</div>
      </dialog>
    </>
  );
}
