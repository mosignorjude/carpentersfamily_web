"use client";

import { Loader2 } from "lucide-react";
import type React from "react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";
import { dispatchActionStatusToast } from "./flash-card";

export type CfButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "tab";

export type CfButtonSize = "default" | "compact" | "large" | "icon";

export interface CfButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CfButtonVariant;
  size?: CfButtonSize;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ElementType;
  rightIcon?: React.ElementType;
}

const variantStyles: Record<CfButtonVariant, string> = {
  primary:
    "bg-[#174C37] text-white hover:bg-[#103D2B] active:bg-[#0A291C] border border-[#174C37] shadow-xs",
  secondary:
    "bg-[#FAF6F0] text-[#3D291F] hover:bg-white active:bg-[#F2ECE4] border border-[#E5DDD3] hover:border-[#174C37]/30 shadow-2xs",
  danger:
    "bg-[#BA3C2A] text-white hover:bg-[#9B2F20] active:bg-[#7D2418] border border-[#BA3C2A] shadow-xs",
  ghost:
    "bg-transparent text-[#5C4638] hover:bg-[#FAF6F0] hover:text-[#174C37] active:bg-[#F2ECE4] border border-transparent",
  tab: "bg-white text-[#5C4638] hover:text-[#174C37] border border-[#E5DDD3] hover:border-[#174C37]/40",
};

const sizeStyles: Record<CfButtonSize, string> = {
  default: "h-12 px-4 py-2 text-sm font-bold rounded-xl gap-2",
  compact: "h-11 px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5",
  large: "h-12 px-6 py-3 text-sm font-bold rounded-xl gap-2.5",
  icon: "h-11 w-11 p-0 rounded-xl justify-center text-sm",
};

/**
 * Standardized button primitive with built-in loading spinner, micro-interactions,
 * and accessibility states.
 */
export const CfButton = forwardRef<HTMLButtonElement, CfButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      loading = false,
      loadingText,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      disabled,
      className = "",
      type = "button",
      ...props
    },
    ref,
  ) => {
    const isActuallyDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        aria-busy={loading}
        className={`inline-flex items-center justify-center font-sans tracking-tight transition-all duration-150 ease-out select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={isActuallyDisabled}
        type={type}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-current" />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          <>
            {LeftIcon && <LeftIcon className="w-4 h-4 shrink-0" />}
            {children && <span>{children}</span>}
            {RightIcon && <RightIcon className="w-4 h-4 shrink-0" />}
          </>
        )}
      </button>
    );
  },
);

CfButton.displayName = "CfButton";

export interface FormSubmitButtonProps
  extends Omit<CfButtonProps, "loading" | "type"> {
  pendingLabel?: string;
  statusToastTitle?: string;
  statusToastMessage?: string;
  showStatusToast?: boolean;
}

/**
 * Connected server-action submit button that automatically listens to React `useFormStatus`
 * and manages disabled and loading spinner micro-interaction state plus an Action Status Toast.
 */
export function FormSubmitButton({
  children,
  pendingLabel,
  loadingText,
  statusToastTitle,
  statusToastMessage,
  showStatusToast = true,
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const wasPendingRef = useRef(false);
  const resolvedLabel =
    loadingText ??
    pendingLabel ??
    (typeof children === "string" ? `${children}…` : "Processing Action…");

  useEffect(() => {
    if (pending && !wasPendingRef.current && showStatusToast) {
      wasPendingRef.current = true;
      dispatchActionStatusToast({
        title: statusToastTitle ?? resolvedLabel.replace(/\.+$/, ""),
        message:
          statusToastMessage ??
          "Processing your request and updating club records…",
      });
    } else if (!pending) {
      wasPendingRef.current = false;
    }
  }, [
    pending,
    resolvedLabel,
    showStatusToast,
    statusToastMessage,
    statusToastTitle,
  ]);

  return (
    <CfButton
      disabled={disabled || pending}
      loading={pending}
      loadingText={loadingText ?? pendingLabel}
      type="submit"
      {...props}
    >
      {children}
    </CfButton>
  );
}
