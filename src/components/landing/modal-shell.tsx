"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { IntakeNotice } from "@/lib/intake-notice";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared control skin so every modal field reads and focuses the same way. */
export const MODAL_INPUT =
  "w-full rounded-lg border border-linen bg-white px-3.5 py-2.5 text-espresso placeholder:text-umber/75 focus:border-forest focus:outline-hidden";

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  titleId: string;
  wide?: boolean;
  notice?: IntakeNotice;
  children: ReactNode;
}

/**
 * The one dialog frame the landing modals share: focus enters and leaves with
 * it, Tab cannot escape, Escape and the scrim both close it.
 */
export function ModalShell({
  isOpen,
  onClose,
  eyebrow,
  title,
  titleId,
  wide = false,
  notice,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // LandingModals hands back a fresh callback on every render; holding it in a
  // ref keeps the open/close effect from tearing down mid-keystroke.
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const returnTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    panel?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const stops = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      const inside = panel.contains(active);

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-deep/60 backdrop-blur-xs cursor-default border-0"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-2xl border border-linen bg-cream p-6 shadow-2xl outline-hidden ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-terra">
              {eyebrow}
            </span>
            <h3
              id={titleId}
              className="font-serif text-2xl font-bold text-espresso"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg border border-linen text-lg text-espresso transition-colors hover:bg-linen/40"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {notice && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-terra/30 bg-terra/5 px-3.5 py-3"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-terra">
              {notice.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-espresso">
              {notice.message}
            </p>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

interface ModalFieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
}

/** Labels stay on-screen: a placeholder is erased the moment the field is filled. */
export function ModalField({ label, htmlFor, children }: ModalFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-umber"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

interface ModalSubmitProps {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}

export function ModalSubmit({
  children,
  className = "",
  pendingLabel = "Sending…",
}: ModalSubmitProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`btn flex-1 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
