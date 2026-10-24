"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  archiveEventAction,
  reopenEventAction,
  setEventStatusAction,
} from "@/app/actions";
import { FormFieldHint } from "@/components/ui";
import { dispatchActionStatusToast } from "@/components/ui/flash-card";
import type { EventRow } from "./event-types";

export type EventLifecycleAction = "complete" | "cancel" | "reopen" | "archive";

interface EventLifecycleModalProps {
  isOpen: boolean;
  event: EventRow | null;
  action: EventLifecycleAction | null;
  onClose: () => void;
}

export function EventLifecycleModal({
  isOpen,
  event,
  action,
  onClose,
}: EventLifecycleModalProps) {
  const [isPending, setIsPending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsPending(false);
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Focus the first focusable element
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialog) {
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !event || !action) return null;

  const config = {
    complete: {
      title: "Mark Event as Completed",
      subtitle: "Conclude event proceedings and lock planning changes",
      badge: "Completion Governance",
      buttonText: "Confirm Event Completion",
      buttonClass: "bg-[#174C37] hover:bg-[#103D2B] text-white",
      icon: <CheckCircle2 className="w-5 h-5 text-white" />,
      iconBg: "bg-[#174C37]",
      serverAction: setEventStatusAction,
      statusValue: "completed",
      confirmLabel:
        "I confirm this event has concluded and all records are accurate",
      desc: "Marking this event completed locks planning changes. Only Club Administrators or Backup Administrators can reopen it with an audited reason.",
    },
    cancel: {
      title: "Cancel Scheduled Event",
      subtitle: "Halt preparations and lock future transactions",
      badge: "Cancellation Protocol",
      buttonText: "Confirm Event Cancellation",
      buttonClass: "bg-[#BA3C2A] hover:bg-[#9B2F20] text-white",
      icon: <AlertTriangle className="w-5 h-5 text-white" />,
      iconBg: "bg-[#BA3C2A]",
      serverAction: setEventStatusAction,
      statusValue: "cancelled",
      confirmLabel: "I confirm that this gathering is officially cancelled",
      desc: "Cancelling locks event planning immediately and records the cancellation in the audit log.",
    },
    reopen: {
      title: "Reopen Concluded Event Planning",
      subtitle: "Authorize administrative correction and unlock modifications",
      badge: "Governance Override",
      buttonText: "Authorize & Reopen Event",
      buttonClass: "bg-[#174C37] hover:bg-[#103D2B] text-white",
      icon: <RotateCcw className="w-5 h-5 text-[#D6A23A]" />,
      iconBg: "bg-[#0C3325]",
      serverAction: reopenEventAction,
      statusValue: null,
      confirmLabel:
        "I certify administrative necessity to reopen locked event planning",
      desc: "Restricted to Club Administrators and Backup Administrators. This action writes directly to the immutable governance audit trail.",
    },
    archive: {
      title: "Move Event to Retained Archive",
      subtitle: "Preserve historical record in permanent archive",
      badge: "Permanent Archive",
      buttonText: "Confirm Retained Archive",
      buttonClass: "bg-[#3D291F] hover:bg-[#2A1C15] text-white",
      icon: <Archive className="w-5 h-5 text-[#D6A23A]" />,
      iconBg: "bg-[#3D291F]",
      serverAction: archiveEventAction,
      statusValue: null,
      confirmLabel:
        "I confirm this event is moving to the retained archive for permanent reporting",
      desc: "Removes the event from active lists while preserving complete attendance rosters, minutes, and linked financial vouchers for permanent audit compliance.",
    },
  }[action];

  return (
    <div
      aria-labelledby="event-lifecycle-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs"
      ref={dialogRef}
      role="dialog"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl ${config.iconBg} text-white flex items-center justify-center font-bold text-base shadow-xs`}
            >
              {config.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className="text-base font-extrabold text-[#3D291F]"
                  id="event-lifecycle-title"
                >
                  {config.title}
                </h3>
              </div>
              <p className="text-xs text-[#54433A] font-medium">
                {config.subtitle}
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 bg-transparent border-0 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          action={config.serverAction}
          className="p-6 space-y-4"
          onSubmit={() => {
            setIsPending(true);
            dispatchActionStatusToast({
              title: `${config.title}…`,
              message: `Updating lifecycle state for ${event.title}.`,
            });
          }}
        >
          <input name="event_id" type="hidden" value={event.id} />
          {config.statusValue && (
            <input name="status" type="hidden" value={config.statusValue} />
          )}

          {/* Event Context Card */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
                {event.event_type} Event
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-[#3D291F]">
              {event.title}
            </h4>
            <p className="text-xs text-[#7A685D]">{config.desc}</p>
          </div>

          {/* Reason Input */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="event-lifecycle-reason"
            >
              Governance Reason / Audit Justification{" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <textarea
              id="event-lifecycle-reason"
              className="w-full h-24 p-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              maxLength={500}
              name="reason"
              placeholder="State the formal club resolution, executive consensus, or operational cause..."
              required
            />
            <FormFieldHint message="Recorded in the permanent governance audit log with your member identity." />
          </div>

          {/* Mandatory Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] cursor-pointer">
            <input
              className="mt-0.5 rounded border-[#E5DDD3] text-[#174C37] focus:ring-[#174C37]"
              name="confirm"
              required
              type="checkbox"
              value="yes"
            />
            <span className="text-xs font-semibold text-[#3D291F] leading-snug">
              {config.confirmLabel}
            </span>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[44px] ${config.buttonClass} ${
                isPending ? "opacity-60 cursor-not-allowed" : ""
              }`}
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Processing..." : config.buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
