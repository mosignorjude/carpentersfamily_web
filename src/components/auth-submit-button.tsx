"use client";

import { Loader2 } from "lucide-react";
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
      <span
        aria-live="polite"
        className="inline-flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            <span>{pendingLabel}</span>
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-0.5"
            >
              <span className="h-1 w-1 rounded-full bg-current animate-bounce" />
              <span className="h-1 w-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
              <span className="h-1 w-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
            </span>
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}
