"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type AuthSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  disabled?: boolean;
  pendingLabel: string;
};

export default function AuthSubmitButton({
  children,
  className,
  describedBy,
  disabled = false,
  pendingLabel,
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending || undefined}
      aria-describedby={describedBy}
      className={className}
      disabled={disabled || pending}
      type="submit"
    >
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}
