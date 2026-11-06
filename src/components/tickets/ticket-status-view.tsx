"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
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
  recorded: "Waiting for officer's check",
  approved: "Confirmed",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

interface SubmittedOrderStorage {
  eventId?: string;
  eventName?: string;
  tierName?: string;
  quantity?: number;
  total?: number;
  buyerName?: string;
  buyerEmail?: string;
  bankName?: string;
  accountNumber?: string;
}

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
      ? "bg-forest/10 text-forest border border-forest/30"
      : status.verification_status === "recorded"
        ? "bg-ochre/15 text-espresso border border-ochre/30"
        : "bg-terracotta/10 text-terracotta border border-terracotta/30";

  return (
    <article className="rounded-3xl bg-warm-canvas/60 border border-linen p-6 sm:p-10 space-y-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-linen pb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
            Order Reference
          </span>
          <span className="text-xl sm:text-2xl font-mono font-extrabold text-forest tracking-wider">
            {reference}
          </span>
        </div>
        <button
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border border-linen bg-white hover:bg-cream text-xs font-bold text-espresso transition-colors cursor-pointer shadow-2xs"
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

      <div className="space-y-1.5">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusBadgeClass}`}
        >
          {STATUS_LABEL[status.verification_status]}
        </span>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-espresso">
          {status.event_title}
        </h2>
        <p className="text-xs sm:text-sm text-body">
          {formatEventTime(status.event_starts_at)}
        </p>
      </div>

      {/* 4-Stat Cards from Server-Rendered Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-linen shadow-2xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            EVENT
          </span>
          <p className="mt-1 font-serif font-bold text-xs sm:text-sm text-espresso truncate">
            {status.event_title}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-linen shadow-2xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            TIER
          </span>
          <p className="mt-1 font-semibold text-xs sm:text-sm text-espresso truncate">
            {status.tier_name}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-linen shadow-2xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            QUANTITY
          </span>
          <p className="mt-1 font-semibold text-xs sm:text-sm text-espresso">
            {status.quantity} {status.quantity === 1 ? "ticket" : "tickets"}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-linen shadow-2xs">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            TOTAL
          </span>
          <p className="mt-1 font-mono font-bold text-sm sm:text-base text-forest">
            {formatNaira(status.amount_ngn)}
          </p>
        </div>
      </div>

      {(status.verification_status === "rejected" ||
        status.verification_status === "cancelled") &&
        status.outcome_reason && (
          <section
            aria-label="Officer's reason"
            className="rounded-2xl bg-terracotta/5 border border-terracotta/20 p-4 space-y-1"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta block">
              Officer&apos;s Note
            </span>
            <p className="text-xs sm:text-sm text-espresso leading-relaxed">
              {status.outcome_reason}
            </p>
          </section>
        )}

      <div className="pt-4 border-t border-linen flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-xs font-bold text-forest hover:text-deep-forest-hover transition-colors no-underline"
          href="/tickets"
        >
          ← Back to the box office
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
  const [copiedRef, setCopiedRef] = useState(false);
  const [showLookupForm, setShowLookupForm] = useState(!initialReference);
  const [submittedOrder, setSubmittedOrder] =
    useState<SubmittedOrderStorage | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("cf-last-submitted-order");
      if (raw) {
        setSubmittedOrder(JSON.parse(raw));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const shown = state.status;
  const reference =
    shown?.public_reference || state.pendingReference || initialReference;

  const copyOrderRef = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  // If a live status has been looked up, display the status card
  if (shown) {
    return <OrderStatusCard reference={reference} status={shown} />;
  }

  // If initialReference is present, user has not toggled to manual lookup form,
  // and the order draft exists in storage from submission in this session:
  if (
    initialReference &&
    !showLookupForm &&
    submittedOrder?.eventName &&
    submittedOrder?.buyerEmail
  ) {
    const totalAmount = submittedOrder.total ?? 0;
    const buyerEmail = submittedOrder.buyerEmail;
    const eventName = submittedOrder.eventName;
    const tierName = submittedOrder.tierName || "Ticket";
    const quantity = submittedOrder.quantity ?? 1;
    const bankName = submittedOrder.bankName;
    const accountNumber = submittedOrder.accountNumber;
    const buyerSuffix = submittedOrder.buyerName?.trim() || "";
    const eventSlug =
      eventName.toUpperCase().includes("ISSELE") ||
      eventName.toUpperCase().includes("RAVE")
        ? "SLKRAVE"
        : eventName
            .replace(/[^A-Za-z0-9]/g, "")
            .slice(0, 8)
            .toUpperCase() || "EVENT";
    const narrationText = `TICKETS-${eventSlug}-${buyerSuffix.toUpperCase() || "NAME"}`;

    return (
      <section
        aria-label="Order submitted for review"
        className="rounded-3xl bg-warm-canvas/60 border border-linen p-6 sm:p-10 shadow-sm space-y-6"
      >
        {/* 3-Step Indicator Bar showing all completed steps */}
        <nav
          aria-label="Ticket purchase steps"
          className="p-2 sm:p-2.5 rounded-2xl bg-white border border-linen shadow-2xs"
        >
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <li className="flex items-center gap-2 px-3 py-2 rounded-xl bg-forest/10 border border-forest/20 text-forest text-xs font-semibold">
              <span className="w-5 h-5 rounded-full bg-forest text-white grid place-items-center shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
              </span>
              <span>1. Choose Your Ticket</span>
            </li>
            <li className="flex items-center gap-2 px-3 py-2 rounded-xl bg-forest/10 border border-forest/20 text-forest text-xs font-semibold">
              <span className="w-5 h-5 rounded-full bg-forest text-white grid place-items-center shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
              </span>
              <span>2. Enter Your Details</span>
            </li>
            <li className="flex items-center gap-2 px-3 py-2 rounded-xl bg-forest/10 border border-forest/20 text-forest text-xs font-semibold">
              <span className="w-5 h-5 rounded-full bg-forest text-white grid place-items-center shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
              </span>
              <span>3. Payment &amp; Receipt</span>
            </li>
          </ol>
        </nav>

        {/* Eyebrow Chip */}
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-widest uppercase">
          ORDER SUBMITTED
        </span>

        {/* Headline */}
        <div className="space-y-1.5">
          <h1 className="font-serif font-bold text-3xl sm:text-4xl text-espresso tracking-tight">
            We&apos;ve logged your order
          </h1>
          <p className="text-sm sm:text-base text-body leading-relaxed">
            Your order is now{" "}
            <strong className="font-semibold text-espresso">
              pending review
            </strong>{" "}
            by the Carpenters Family committee.
          </p>
        </div>

        {/* Order Reference Box with Copy Button */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              ORDER REFERENCE
            </span>
            <span className="mt-1 block font-mono font-extrabold text-2xl sm:text-3xl text-forest tracking-wider">
              {reference}
            </span>
          </div>

          <button
            className="min-h-[44px] px-4 py-2 rounded-xl bg-warm-canvas border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
            onClick={copyOrderRef}
            type="button"
          >
            {copiedRef ? (
              <>
                <Check className="w-4 h-4 text-forest" strokeWidth={2} />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-forest" strokeWidth={2} />
                <span>Copy reference</span>
              </>
            )}
          </button>
        </div>

        {/* Four Facts: Event, Tier, Quantity, Total */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-linen col-span-2 sm:col-span-1 shadow-2xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              EVENT
            </dt>
            <dd className="mt-1 text-sm font-bold text-espresso truncate">
              {eventName}
            </dd>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-linen shadow-2xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              TIER
            </dt>
            <dd className="mt-1 text-sm font-bold text-espresso truncate">
              {tierName}
            </dd>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-linen shadow-2xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              QUANTITY
            </dt>
            <dd className="mt-1 text-sm font-bold text-espresso">
              {quantity} {quantity === 1 ? "ticket" : "tickets"}
            </dd>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-linen col-span-2 sm:col-span-1 shadow-2xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              TOTAL
            </dt>
            <dd className="mt-1 font-mono font-bold text-base sm:text-lg text-forest">
              {formatNaira(totalAmount)}
            </dd>
          </div>
        </dl>

        {/* Three Numbered "What happens next" Steps */}
        <div className="pt-6 border-t border-linen space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">
            WHAT HAPPENS NEXT
          </h2>

          <ol className="space-y-4">
            <li className="flex items-start gap-3.5">
              <span className="w-6 h-6 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                1
              </span>
              <div className="text-xs sm:text-sm text-body leading-relaxed">
                <strong className="text-espresso font-semibold block sm:inline">
                  Transfer the exact amount using the narration:{" "}
                </strong>
                Ensure your{" "}
                <span className="font-mono font-bold text-forest">
                  {formatNaira(totalAmount)}
                </span>{" "}
                {bankName && accountNumber
                  ? `transfer to ${bankName} (${accountNumber}) `
                  : "transfer "}
                carries{" "}
                <span className="font-mono font-semibold text-espresso">
                  {narrationText}
                </span>
                .
              </div>
            </li>

            <li className="flex items-start gap-3.5">
              <span className="w-6 h-6 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                2
              </span>
              <div className="text-xs sm:text-sm text-body leading-relaxed">
                <strong className="text-espresso font-semibold block sm:inline">
                  An officer checks it against the bank statement:{" "}
                </strong>
                A club officer verifies your uploaded receipt against our actual
                bank statement.
              </div>
            </li>

            <li className="flex items-start gap-3.5">
              <span className="w-6 h-6 rounded-full bg-forest text-white font-mono text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                3
              </span>
              {/* Exact Statement as Specified in Requirement */}
              <div className="text-xs sm:text-sm text-body leading-relaxed">
                <strong className="text-espresso font-semibold block sm:inline">
                  You&apos;ll get an email in a few minutes:{" "}
                </strong>
                Once your transfer is confirmed, we&apos;ll email {buyerEmail} —
                usually within a few minutes.
              </div>
            </li>
          </ol>
        </div>

        {/* Warning Callout Box */}
        <div className="p-4 rounded-2xl bg-ochre/10 border border-ochre/30 text-xs sm:text-sm text-espresso leading-relaxed">
          This order does not hold your seats until an officer confirms it —
          someone else could take the last ticket meanwhile.
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            className="min-h-[48px] px-6 py-3 rounded-xl bg-forest hover:bg-deep-forest-hover text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
            onClick={() => setShowLookupForm(true)}
            type="button"
          >
            <span>Check your ticket status →</span>
          </button>

          <Link
            className="min-h-[48px] px-6 py-3 rounded-xl bg-white border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 transition-colors no-underline shadow-2xs text-center"
            href="/tickets"
          >
            <span>← Back to the box office</span>
          </Link>
        </div>
      </section>
    );
  }

  // Check Ticket Status Lookup Form
  return (
    <div className="rounded-3xl bg-white border border-linen p-6 sm:p-8 space-y-6 shadow-sm">
      <div className="space-y-1">
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-widest uppercase">
          TICKET LOOKUP
        </span>
        <h1 className="font-serif font-bold text-2xl sm:text-3xl text-espresso">
          Check Ticket Status
        </h1>
        <p className="text-xs sm:text-sm text-body">
          Enter your order reference and the email address you used when
          submitting your order to check verification status.
        </p>
      </div>

      <form action={lookupAction} className="space-y-4">
        <div className="space-y-1.5">
          <label
            className="block text-[11px] font-bold uppercase tracking-wider text-muted"
            htmlFor="order-ref"
          >
            ORDER REFERENCE
          </label>
          <input
            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-linen bg-white font-mono text-sm tracking-wider text-espresso uppercase focus:border-forest outline-hidden"
            defaultValue={initialReference || undefined}
            id="order-ref"
            maxLength={16}
            name="reference"
            placeholder="CF-XXXXXXXX"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-[11px] font-bold uppercase tracking-wider text-muted"
            htmlFor="order-email"
          >
            EMAIL ADDRESS
          </label>
          <input
            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-linen bg-white text-sm text-espresso focus:border-forest outline-hidden"
            defaultValue={submittedOrder?.buyerEmail || undefined}
            id="order-email"
            inputMode="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <p className="text-[11px] text-muted">
            Both are needed. The reference alone does not prove the order is
            yours.
          </p>
        </div>

        {state.notFound && (
          <p className="text-xs font-semibold text-terra" role="alert">
            No order matches that reference and email. Check both and try again.
          </p>
        )}

        {state.error && (
          <p className="text-xs font-semibold text-terra" role="alert">
            {getSystemNotice(state.error)?.message ??
              "We could not check that order just now. Please try again shortly."}
          </p>
        )}

        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-forest text-white text-xs sm:text-sm font-semibold hover:bg-deep-forest-hover transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            disabled={isPending}
            type="submit"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isPending ? "Checking…" : "Check ticket status"}</span>
          </button>

          {initialReference && (
            <button
              className="min-h-[48px] px-6 py-3 rounded-xl bg-warm-canvas border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              onClick={() => setShowLookupForm(false)}
              type="button"
            >
              <span>Back to order details</span>
            </button>
          )}

          <Link
            className="min-h-[48px] px-6 py-3 rounded-xl bg-white border border-linen text-body text-xs sm:text-sm font-semibold hover:text-espresso hover:border-forest inline-flex items-center justify-center gap-2 transition-colors no-underline text-center"
            href="/tickets"
          >
            <span>← Back to tickets</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
