"use client";

import {
  AlertCircle,
  ArrowLeft,
  Inbox,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { clubBrand } from "@/lib/brand";

export interface EmptyStateCardProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

/**
 * Standardized empty state card for lists, tables, and tabs without records.
 */
export function EmptyStateCard({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = "",
}: EmptyStateCardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#E5DDD3] bg-white p-8 sm:p-12 text-center shadow-xs space-y-4 max-w-xl mx-auto w-full animate-in fade-in duration-150 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center mx-auto text-[#174C37] shadow-2xs">
        <Icon className="w-6 h-6 stroke-[1.75]" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base sm:text-lg font-bold text-[#3D291F] tracking-tight">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-[#7A685D] max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {actionLabel && (onAction || actionHref) && (
        <div className="pt-2">
          {actionHref ? (
            <Link
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs"
              href={actionHref}
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface AccessDeniedCardProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

/**
 * Dignified 403 / Access Denied state screen for unauthorized member roles.
 */
export function AccessDeniedCard({
  title = "Restricted Assembly Access",
  description = "You do not have the required club leadership clearance or executive assignment to access this management desk.",
  backHref = "/",
  backLabel = "Return to Dashboard",
  className = "",
}: AccessDeniedCardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#BA3C2A]/25 bg-white p-8 sm:p-12 text-center shadow-xs space-y-5 max-w-lg mx-auto w-full my-8 ${className}`}
      role="alert"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#FFF9F8] border border-[#BA3C2A]/20 flex items-center justify-center mx-auto text-[#BA3C2A] shadow-2xs">
        <ShieldAlert className="w-7 h-7 stroke-[1.75]" />
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#BA3C2A] bg-[#BA3C2A]/10 px-2.5 py-1 rounded-md inline-block">
          Clearance Required
        </span>
        <h2 className="text-lg sm:text-xl font-extrabold text-[#3D291F] tracking-tight">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-[#7A685D] max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      <div className="pt-2">
        <Link
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] hover:border-[#174C37]/40 text-xs font-bold text-[#174C37] transition-colors shadow-2xs"
          href={backHref}
        >
          <ArrowLeft className="w-4 h-4 text-[#174C37]" />
          <span>{backLabel}</span>
        </Link>
      </div>
    </div>
  );
}

export interface DataUnavailableCardProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Standardized fallback screen when backend queries or storage services fail to load.
 */
export function DataUnavailableCard({
  title = "Records Temporarily Unavailable",
  description = "We could not securely verify the requested records from the institutional database. Check your network connection or try again shortly.",
  onRetry,
  retryLabel = "Retry Verification",
  className = "",
}: DataUnavailableCardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#E5DDD3] bg-white p-8 sm:p-12 text-center shadow-xs space-y-4 max-w-lg mx-auto w-full my-8 ${className}`}
      role="status"
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center mx-auto text-[#7A685D] shadow-2xs">
        <AlertCircle className="w-6 h-6 stroke-[1.75] text-[#D6A23A]" />
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A685D] block">
          {clubBrand.shortName} Verification
        </span>
        <h3 className="text-base sm:text-lg font-bold text-[#3D291F] tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-[#7A685D] max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {onRetry && (
        <div className="pt-2">
          <button
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors cursor-pointer shadow-2xs"
            onClick={onRetry}
            type="button"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#174C37]" />
            <span>{retryLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
