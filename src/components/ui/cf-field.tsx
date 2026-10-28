"use client";

import type React from "react";
import { forwardRef, useId } from "react";

/**
 * Shared form control classes for the money-entry floor: 48px tall
 * (`min-h-[3rem]`) with 16px text (`text-base`), per DESIGN.md. Every migrated
 * control inherits this instead of hand-rolling its own sizing.
 */
export const CONTROL =
  "w-full min-h-[3rem] px-3 rounded-xl border border-[#E5DDD3] bg-white text-base font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] placeholder:font-normal focus:outline-hidden focus:ring-2 focus:ring-[#174C37] disabled:opacity-60";

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  hintId?: string;
  errorId?: string;
};

/**
 * What a caller may pass to the primitives. `htmlFor`, `hintId` and `errorId`
 * belong to `CfFieldLayout` only: `CfTextField`/`CfSelect` derive all three from
 * the control's own `id`, so a stray one can never be forwarded to the DOM node.
 */
type CfFieldProps = Omit<FieldShellProps, "errorId" | "hintId" | "htmlFor">;

/**
 * The one label / hint / error implementation in this file. `CfTextField` and
 * `CfSelect` render through it, and callers that must own the control themselves
 * (the thousands-separator `FormattedAmountInput` money fields) render through it
 * too, passing `htmlFor` plus the `hintId`/`errorId` they wire `aria-describedby`
 * to. Pass `errorId`/`hintId` whenever the control references them: the paragraphs
 * get exactly those ids, so `aria-describedby` never points at a missing node.
 */
export function CfFieldLayout({
  children,
  error,
  errorId,
  hint,
  hintId,
  htmlFor,
  label,
}: FieldShellProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label
        className="block text-sm font-semibold text-[#3D291F]"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-sm text-[#5C4638]" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="text-sm font-semibold text-[#BA3C2A]"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const CfTextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & CfFieldProps
>(({ label, hint, error, className = "", id, ...props }, ref) => {
  const generatedId = useId();
  const htmlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${htmlId}-hint` : undefined;
  const errorId = error ? `${htmlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <CfFieldLayout
      error={error}
      errorId={errorId}
      hint={hint}
      hintId={hintId}
      htmlFor={htmlId}
      label={label}
    >
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]" : ""} ${className}`}
        id={htmlId}
        ref={ref}
        {...props}
      />
    </CfFieldLayout>
  );
});
CfTextField.displayName = "CfTextField";

export const CfSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & CfFieldProps
>(({ label, hint, error, className = "", id, children, ...props }, ref) => {
  const generatedId = useId();
  const htmlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${htmlId}-hint` : undefined;
  const errorId = error ? `${htmlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <CfFieldLayout
      error={error}
      errorId={errorId}
      hint={hint}
      hintId={hintId}
      htmlFor={htmlId}
      label={label}
    >
      <select
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]" : ""} ${className}`}
        id={htmlId}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    </CfFieldLayout>
  );
});
CfSelect.displayName = "CfSelect";
