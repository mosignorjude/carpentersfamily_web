"use client";

import { Check, Copy, Loader2, Ticket } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { lookupTicketOrderAction } from "@/app/actions";
import { formatEventTime } from "@/lib/event-times.mjs";
import { formatNaira } from "@/lib/format";
import { getSystemNotice } from "@/lib/system-notices";
import type { TicketLookupState, TicketOrderStatus } from "./ticket-types";

const INITIAL: TicketLookupState = {
  status: null,
  notFound: false,
  error: null,
  pendingReference: "",
};

const STATUS_LABEL: Record<TicketOrderStatus["verification_status"], string> = {
  recorded: "Waiting for the officer's check",
  approved: "Confirmed",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

function OrderStatusCard({
  status,
  reference,
}: {
  status: TicketOrderStatus;
  reference: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard failure ignored
    }
  };

  const statusBadgeClass =
    status.verification_status === "approved"
      ? "bg-forest/10 text-forest"
      : status.verification_status === "recorded"
        ? "bg-ochre/15 text-espresso"
        : "bg-terracotta/10 text-terracotta";

  return (
    <article className="rounded-2xl bg-white border border-linen p-6 sm:p-8 space-y-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-linen pb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-umber block">
            Order Reference
          </span>
          <span className="text-xl sm:text-2xl font-mono font-extrabold text-forest tracking-wider">
            {reference}
          </span>
        </div>
        <button
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border border-linen bg-cream hover:bg-linen/50 text-xs font-bold text-espresso transition-colors cursor-pointer"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-forest" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-muted" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg sm:text-xl font-extrabold text-espresso">
          {status.event_title}
        </h2>
        <p className="text-xs sm:text-sm text-body">
          {formatEventTime(status.event_starts_at)}
        </p>
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-espresso">
          <Ticket className="w-4 h-4 text-forest shrink-0" />
          <span>
            {status.quantity} × {status.tier_name}
          </span>
        </div>
        <div className="text-lg sm:text-xl font-mono font-extrabold text-forest pt-1">
          {formatNaira(status.amount_ngn)}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}
        >
          {STATUS_LABEL[status.verification_status]}
        </span>
      </div>

      {(status.verification_status === "rejected" ||
        status.verification_status === "cancelled") &&
        status.outcome_reason && (
          <section
            aria-label="Officer's reason"
            className="rounded-xl bg-terracotta/5 border border-terracotta/20 p-4 space-y-1"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta block">
              Officer's Note
            </span>
            <p className="text-xs sm:text-sm text-espresso leading-relaxed">
              {status.outcome_reason}
            </p>
          </section>
        )}

      <div className="pt-4 border-t border-linen">
        <Link
          className="inline-flex items-center gap-2 text-xs font-bold text-forest hover:text-deep-forest-hover transition-colors no-underline"
          href="/tickets"
        >
          ← Back to tickets
        </Link>
      </div>
    </article>
  );
}

export function TicketStatusView({
  initialReference,
}: {
  initialReference: string;
}) {
  const [state, lookupAction, isPending] = useActionState(
    lookupTicketOrderAction,
    INITIAL,
  );
  const shown = state.status;
  const reference =
    shown?.public_reference ?? state.pendingReference ?? initialReference;

  return (
    <div className="space-y-6">
      {!shown && (
        <form action={lookupAction} className="space-y-4">
          <div className="space-y-2">
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-espresso"
              htmlFor="order-ref"
            >
              Order reference
            </label>
            <input
              className="w-full min-h-[48px] px-3 rounded-xl border border-linen bg-white font-mono text-sm tracking-wider text-espresso uppercase"
              defaultValue={initialReference || undefined}
              id="order-ref"
              maxLength={16}
              name="reference"
              placeholder="CF-XXXXXXXX"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="block text-[11px] font-bold uppercase tracking-wider text-espresso"
              htmlFor="order-email"
            >
              Email you used
            </label>
            <input
              className="w-full min-h-[48px] px-3 rounded-xl border border-linen bg-white text-sm text-espresso"
              id="order-email"
              inputMode="email"
              name="email"
              required
              type="email"
            />
            <p className="text-[11px] text-muted">
              Both are needed. The reference alone does not prove the order is
              yours.
            </p>
          </div>
          {state.notFound && (
            <p className="text-xs font-semibold text-terracotta">
              No order matches that reference and email. Check both and try
              again.
            </p>
          )}
          {state.error && (
            <p className="text-xs font-semibold text-terracotta" role="alert">
              {getSystemNotice(state.error)?.message ??
                "We could not check that order just now. Please try again shortly."}
            </p>
          )}
          <button
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-forest text-white text-xs font-bold hover:bg-deep-forest-hover transition-colors cursor-pointer disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isPending ? "Checking…" : "Check my order"}</span>
          </button>
        </form>
      )}

      {shown && <OrderStatusCard status={shown} reference={reference} />}
    </div>
  );
}
