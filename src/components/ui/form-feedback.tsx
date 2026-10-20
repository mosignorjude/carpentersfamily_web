"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import type React from "react";

export interface FormFieldErrorProps {
  id?: string;
  message?: string | null;
  className?: string;
}

/**
 * Accessible field-level error message attached directly below inputs.
 */
export function FormFieldError({
  id,
  message,
  className = "",
}: FormFieldErrorProps) {
  if (!message) return null;

  return (
    <p
      aria-live="polite"
      className={`text-[11px] font-semibold text-[#BA3C2A] flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-150 ${className}`}
      id={id}
      role="alert"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#BA3C2A]" />
      <span>{message}</span>
    </p>
  );
}

export interface FormFieldHintProps {
  id?: string;
  message?: string | null;
  className?: string;
}

/**
 * Accessible helper / guidance text placed directly below inputs.
 */
export function FormFieldHint({
  id,
  message,
  className = "",
}: FormFieldHintProps) {
  if (!message) return null;

  return (
    <p
      className={`text-[11px] font-medium text-[#7A685D] mt-1 leading-normal ${className}`}
      id={id}
    >
      {message}
    </p>
  );
}

export interface FormAlertBannerProps {
  variant?: "error" | "warning" | "info" | "success";
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const bannerStyles: Record<
  "error" | "warning" | "info" | "success",
  {
    container: string;
    icon: string;
    titleColor: string;
    textColor: string;
    Icon: React.ElementType;
  }
> = {
  error: {
    container: "bg-[#FFF9F8] border-[#BA3C2A]/30",
    icon: "text-[#BA3C2A]",
    titleColor: "text-[#BA3C2A]",
    textColor: "text-[#5C231B]",
    Icon: AlertCircle,
  },
  warning: {
    container: "bg-[#FDF8EE] border-[#D6A23A]/40",
    icon: "text-[#B27D16]",
    titleColor: "text-[#9E6E16]",
    textColor: "text-[#5C4212]",
    Icon: AlertTriangle,
  },
  info: {
    container: "bg-[#FAF6F0] border-[#E5DDD3]",
    icon: "text-[#174C37]",
    titleColor: "text-[#174C37]",
    textColor: "text-[#4F3E35]",
    Icon: Info,
  },
  success: {
    container: "bg-[#F2F8F5] border-[#174C37]/30",
    icon: "text-[#174C37]",
    titleColor: "text-[#174C37]",
    textColor: "text-[#1C4132]",
    Icon: CheckCircle2,
  },
};

/**
 * Contextual form-level alert banner for high-visibility validation or rejection feedback.
 */
export function FormAlertBanner({
  variant = "error",
  title,
  message,
  onDismiss,
  className = "",
}: FormAlertBannerProps) {
  if (!message) return null;

  const style = bannerStyles[variant] ?? bannerStyles.error;
  const IconComponent = style.Icon;

  return (
    <div
      aria-atomic="true"
      className={`p-3.5 sm:p-4 rounded-xl border text-xs flex items-start gap-3 shadow-2xs animate-in fade-in duration-150 ${style.container} ${className}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <IconComponent
        aria-hidden="true"
        className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`}
      />
      <div className="flex-1 min-w-0">
        {title && (
          <p
            className={`font-bold uppercase tracking-wider text-[11px] mb-0.5 ${style.titleColor}`}
          >
            {title}
          </p>
        )}
        <p className={`leading-relaxed font-medium ${style.textColor}`}>
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss alert"
          className="shrink-0 -mr-1 -mt-1 p-1 rounded-md text-[#7A685D] hover:text-[#3D291F] transition-colors cursor-pointer"
          onClick={onDismiss}
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
