"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitTicketOrderAction } from "@/app/actions";
import { formatNaira } from "@/lib/format";
import {
  HONEYPOT_FIELD,
  isBuyerEmailValid,
  isBuyerPhoneValid,
  stepOneMissingFields,
} from "@/lib/ticket-order-intake.mjs";
import {
  buildCheckoutQuery,
  type CheckoutState,
  clampQuantity,
  DRAFT_STORAGE_KEY,
  maxQuantityForTier,
  tierRemaining,
} from "@/lib/ticket-order-state.mjs";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { PublicBankInfo, PublicTicketedEvent } from "./ticket-types";

export interface TicketCheckoutOverlayProps {
  event: PublicTicketedEvent;
  bank: PublicBankInfo | null;
  checkout: CheckoutState;
  onCheckoutChange: (next: CheckoutState) => void;
  onClose: () => void;
}

interface DraftFields {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
}

const EMPTY_DRAFT: DraftFields = {
  buyerName: "",
  buyerEmail: "",
  buyerPhone: "",
};

function formatEventLine(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function TicketCheckoutOverlay(props: TicketCheckoutOverlayProps) {
  if (!props.checkout) return null;
  return <TicketCheckoutInner {...props} />;
}

function TicketCheckoutInner({
  event,
  bank,
  checkout,
  onCheckoutChange,
  onClose,
}: TicketCheckoutOverlayProps) {
  const [state, formAction, isPending] = useActionState(
    submitTicketOrderAction,
    null,
  );
  const [fields, setFields] = useState<DraftFields>(EMPTY_DRAFT);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => generateUuid());
  const [saleId] = useState(() => generateUuid());
  const [renderedAt] = useState(() => new Date().toISOString());
  const [restored, setRestored] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedNarration, setCopiedNarration] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    file: false,
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    if (typeof window !== "undefined") {
      const search = buildCheckoutQuery(window.location.search, null);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${search}`,
      );
    }
    onClose();
  }

  useModalHygiene({ isOpen: true, onClose: handleClose, dialogRef });

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<DraftFields> & {
        eventId?: string;
      };
      if (draft.eventId === event.id) {
        setFields({
          buyerName: typeof draft.buyerName === "string" ? draft.buyerName : "",
          buyerEmail:
            typeof draft.buyerEmail === "string" ? draft.buyerEmail : "",
          buyerPhone:
            typeof draft.buyerPhone === "string" ? draft.buyerPhone : "",
        });
        setRestored(true);
      }
    } catch {
      // Storage unavailable or unparseable
    }
  }, [event.id]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ ...fields, eventId: event.id }),
      );
    } catch {
      // Storage quota or restriction
    }
  }, [fields, event.id]);

  // If server action returned a refusal with drafted values, reflect them into state
  useEffect(() => {
    if (state?.values) {
      setFields((prev) => ({
        buyerName: state.values.buyer_name ?? prev.buyerName,
        buyerEmail: state.values.buyer_email ?? prev.buyerEmail,
        buyerPhone: state.values.buyer_phone ?? prev.buyerPhone,
      }));
    }
  }, [state]);

  const tiers = event.tiers ?? [];
  const tier = tiers.find((t) => t.id === checkout.tierId) ?? tiers[0] ?? null;
  const remaining = tier ? tierRemaining(tier) : null;
  const maxQty = maxQuantityForTier(remaining);
  const quantity = clampQuantity(checkout.quantity, remaining);
  const total = tier ? Number(tier.price_ngn) * quantity : 0;

  const missing = stepOneMissingFields({
    name: fields.buyerName,
    email: fields.buyerEmail,
    phone: fields.buyerPhone,
  });
  const canContinue = missing.length === 0 && tier !== null;
  const canSubmit =
    canContinue && Boolean(receiptFile) && !fileError && !isPending;

  const step: 1 | 2 = checkout.step === 2 && canContinue ? 2 : 1;

  function go(next: Partial<CheckoutState>) {
    const updatedTier = next.tierId
      ? (tiers.find((t) => t.id === next.tierId) ?? tier)
      : tier;
    const updatedRemaining = updatedTier
      ? tierRemaining(updatedTier)
      : remaining;
    const updated: CheckoutState = {
      ...checkout,
      quantity,
      remaining: updatedRemaining,
      ...next,
    };
    onCheckoutChange(updated);
    if (typeof window !== "undefined") {
      const search = buildCheckoutQuery(window.location.search, updated);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${search}`,
      );
    }
  }

  function handleSelectTier(tierId: string) {
    setReceiptFile(null);
    setFileError(null);
    go({ tierId, step: 1 });
  }

  function handleFileChange(file: File | null) {
    setFileError(null);
    setTouched((prev) => ({ ...prev, file: true }));
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setFileError("The receipt must be 4 MB or smaller.");
      setReceiptFile(null);
      return;
    }
    if (!/^(image\/(png|jpe?g)|application\/pdf)$/i.test(file.type)) {
      setFileError("Upload a PDF or an image of the transfer receipt.");
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }

  const narrationText = `TICKET - ${event.title.slice(0, 20)} - ${
    fields.buyerName.trim() || "YOUR NAME"
  }`;

  const nameError =
    touched.name && !fields.buyerName.trim()
      ? "Enter the buyer's full name"
      : null;
  const emailError =
    touched.email && !isBuyerEmailValid(fields.buyerEmail)
      ? "Enter a valid email address"
      : null;
  const phoneError =
    touched.phone && !isBuyerPhoneValid(fields.buyerPhone)
      ? "Enter a valid phone number (10-15 digits)"
      : null;

  return (
    <div
      aria-labelledby="ticket-checkout-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-espresso/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      role="dialog"
    >
      <button
        aria-label="Close checkout overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0 min-h-[48px]"
        onClick={handleClose}
        type="button"
      />

      <div
        className="relative z-10 w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl border border-linen shadow-2xl max-h-[94vh] flex flex-col overflow-hidden my-auto"
        ref={dialogRef}
      >
        <div className="p-4 sm:p-5 border-b border-linen bg-warm-canvas flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="text-sm sm:text-base font-extrabold text-espresso truncate"
              id="ticket-checkout-title"
            >
              {event.title}
            </h2>
            <p className="text-[11px] text-body">
              {formatEventLine(event.starts_at)} · {event.location}
            </p>
          </div>
          <button
            aria-label="Close checkout"
            className="w-12 h-12 min-h-[48px] min-w-[48px] shrink-0 rounded-full bg-white border border-linen hover:bg-warm-canvas flex items-center justify-center text-muted hover:text-espresso transition-colors cursor-pointer"
            onClick={handleClose}
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          <CheckoutStepIndicator step={step} />

          {state && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-terra/10 border border-terra/30 text-espresso text-xs space-y-1"
            >
              <p className="font-bold text-terra">{state.title}</p>
              <p className="text-body leading-relaxed">{state.message}</p>
            </div>
          )}

          {restored && step === 2 && !receiptFile && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-warm-canvas border border-ochre/40">
              <RefreshCw className="w-4 h-4 text-forest shrink-0 mt-0.5" />
              <p className="text-[11px] sm:text-xs text-body leading-relaxed">
                <span className="font-bold text-espresso">
                  Your details are still here.
                </span>{" "}
                The event, tier, quantity and your details have been restored,
                but the transfer receipt upload did not survive the refresh.
                Please attach it again before submitting.
              </p>
            </div>
          )}

          <form
            action={formAction}
            /* action={submitTicketOrderAction} */
            className="space-y-6"
            encType="multipart/form-data"
            noValidate
            onSubmit={(e) => {
              if (step === 1) {
                e.preventDefault();
                if (canContinue) go({ step: 2 });
                return;
              }
              if (receiptFile && fileInputRef.current) {
                try {
                  const dt = new DataTransfer();
                  dt.items.add(receiptFile);
                  fileInputRef.current.files = dt.files;
                } catch {
                  // Fallback for environments without DataTransfer
                }
              }
            }}
          >
            <input name="event_id" type="hidden" value={event.id} />
            <input name="tier_id" type="hidden" value={tier?.id ?? ""} />
            <input name="quantity" type="hidden" value={quantity} />
            <input name="buyer_name" type="hidden" value={fields.buyerName} />
            <input name="buyer_email" type="hidden" value={fields.buyerEmail} />
            <input name="buyer_phone" type="hidden" value={fields.buyerPhone} />
            <input
              name="idempotency_key"
              type="hidden"
              value={idempotencyKey}
            />
            <input name="sale_id" type="hidden" value={saleId} />
            <input name="rendered_at" type="hidden" value={renderedAt} />
            <input
              autoComplete="off"
              className="sr-only"
              defaultValue=""
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              type="text"
            />

            {step === 1 ? (
              <div className="space-y-6">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
                    Select Ticket Tier
                  </span>
                  <div
                    aria-label={`Ticket tiers for ${event.title}`}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    role="radiogroup"
                  >
                    {tiers.map((t) => {
                      const isSelected = tier?.id === t.id;
                      const rem = tierRemaining(t);
                      const isSoldOut = rem !== null && rem <= 0;

                      return (
                        // biome-ignore lint/a11y/useSemanticElements: custom radio button tile
                        <button
                          aria-checked={isSelected}
                          className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-colors min-h-[48px] cursor-pointer ${
                            isSoldOut
                              ? "border-linen bg-warm-canvas opacity-50 cursor-not-allowed"
                              : isSelected
                                ? "border-forest bg-forest/5 ring-2 ring-forest/20"
                                : "border-linen bg-white hover:border-forest"
                          }`}
                          disabled={isSoldOut}
                          key={t.id}
                          onClick={() => handleSelectTier(t.id)}
                          role="radio"
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-2 w-full">
                            <span className="font-semibold text-sm text-espresso">
                              {t.name}
                            </span>
                            <span
                              className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? "border-forest bg-forest text-white"
                                  : "border-linen bg-white"
                              }`}
                            >
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </span>
                          </div>

                          <div className="mt-3 flex items-baseline justify-between gap-2 w-full">
                            <span className="font-mono font-bold text-base text-forest">
                              {formatNaira(Number(t.price_ngn))}
                            </span>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                              {isSoldOut
                                ? "Sold out"
                                : rem !== null
                                  ? `${rem} left`
                                  : "Available"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-4">
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                      htmlFor={`passes-count-${event.id}`}
                    >
                      Number of Tickets
                    </label>
                    <select
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded-lg border border-linen bg-white text-espresso font-medium text-sm"
                      id={`passes-count-${event.id}`}
                      key={`qty-${tier?.id}-${quantity}`}
                      onChange={(e) =>
                        go({
                          quantity: clampQuantity(
                            Number(e.target.value),
                            maxQty,
                          ),
                        })
                      }
                      value={quantity}
                    >
                      {Array.from({ length: maxQty }, (_, i) => i + 1).map(
                        (num) => (
                          <option key={num} value={num}>
                            {num} {num === 1 ? "ticket" : "tickets"}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="sm:col-span-8">
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                      htmlFor={`buyer-name-${event.id}`}
                    >
                      Guest / Buyer Name
                    </label>
                    <input
                      aria-describedby={
                        nameError ? `name-err-${event.id}` : undefined
                      }
                      aria-invalid={Boolean(nameError)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                        nameError ? "border-terra" : "border-linen"
                      }`}
                      id={`buyer-name-${event.id}`}
                      maxLength={160}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, name: true }))
                      }
                      onChange={(e) =>
                        setFields((f) => ({ ...f, buyerName: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (canContinue) go({ step: 2 });
                        }
                      }}
                      placeholder="e.g. Adaeze Nwosu"
                      type="text"
                      value={fields.buyerName}
                    />
                    {nameError && (
                      <p
                        className="mt-1.5 text-xs font-medium text-terra"
                        id={`name-err-${event.id}`}
                      >
                        {nameError}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-6">
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                      htmlFor={`buyer-email-${event.id}`}
                    >
                      Email Address
                    </label>
                    <input
                      aria-describedby={
                        emailError ? `email-err-${event.id}` : undefined
                      }
                      aria-invalid={Boolean(emailError)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                        emailError ? "border-terra" : "border-linen"
                      }`}
                      id={`buyer-email-${event.id}`}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, email: true }))
                      }
                      onChange={(e) =>
                        setFields((f) => ({ ...f, buyerEmail: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (canContinue) go({ step: 2 });
                        }
                      }}
                      placeholder="you@example.com"
                      type="email"
                      value={fields.buyerEmail}
                    />
                    {emailError && (
                      <p
                        className="mt-1.5 text-xs font-medium text-terra"
                        id={`email-err-${event.id}`}
                      >
                        {emailError}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-6">
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                      htmlFor={`buyer-phone-${event.id}`}
                    >
                      Phone Number
                    </label>
                    <input
                      aria-describedby={
                        phoneError ? `phone-err-${event.id}` : undefined
                      }
                      aria-invalid={Boolean(phoneError)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-lg border bg-white text-espresso text-sm placeholder:text-muted/60 ${
                        phoneError ? "border-terra" : "border-linen"
                      }`}
                      id={`buyer-phone-${event.id}`}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, phone: true }))
                      }
                      onChange={(e) => {
                        const cleanPhone = e.target.value.replace(
                          /[^\d+]/g,
                          "",
                        );
                        setFields((f) => ({ ...f, buyerPhone: cleanPhone }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (canContinue) go({ step: 2 });
                        }
                      }}
                      placeholder="08030000000"
                      type="tel"
                      value={fields.buyerPhone}
                    />
                    {phoneError && (
                      <p
                        className="mt-1.5 text-xs font-medium text-terra"
                        id={`phone-err-${event.id}`}
                      >
                        {phoneError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-xl bg-warm-canvas border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Selection Summary
                    </span>
                    <p className="mt-1 text-sm sm:text-base font-semibold text-espresso">
                      {quantity} × {tier?.name ?? "Ticket"} —{" "}
                      <span className="font-mono font-bold text-lg sm:text-xl text-forest">
                        {formatNaira(total)}
                      </span>
                    </p>
                    {missing.length > 0 && (
                      <p aria-live="polite" className="mt-1 text-xs text-muted">
                        To continue to checkout, please enter:{" "}
                        <span className="font-medium text-espresso">
                          {missing.join(", ")}
                        </span>
                        .
                      </p>
                    )}
                  </div>

                  <button
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-forest hover:bg-deep-forest-hover text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canContinue}
                    onClick={() => {
                      setTouched({
                        name: true,
                        email: true,
                        phone: true,
                        file: false,
                      });
                      if (canContinue) go({ step: 2 });
                    }}
                    type="button"
                  >
                    <span>Continue to payment</span>
                    <ArrowRight
                      className="w-4 h-4 text-ochre"
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    className="min-h-[48px] px-3.5 py-2 rounded-xl bg-white border border-linen text-forest text-xs sm:text-sm font-semibold hover:border-forest inline-flex items-center gap-2 transition-colors cursor-pointer"
                    onClick={() => go({ step: 1 })}
                    type="button"
                  >
                    <ArrowLeft
                      className="w-4 h-4 text-forest"
                      strokeWidth={2}
                    />
                    <span>Back to tickets</span>
                  </button>

                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-forest/10 text-forest text-[11px] font-semibold uppercase tracking-wider">
                    Step 2 of 2 · Payment &amp; Receipt
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-6 space-y-4">
                    <div className="bg-warm-canvas rounded-xl border border-linen p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Order Summary
                        </span>
                        <button
                          className="min-h-[48px] text-xs font-semibold text-forest hover:underline cursor-pointer"
                          onClick={() => go({ step: 1 })}
                          type="button"
                        >
                          Edit details
                        </button>
                      </div>

                      <div>
                        <p className="font-bold text-base text-espresso">
                          {event.title}
                        </p>
                        <p className="mt-1 text-sm font-medium text-espresso">
                          {quantity} × {tier?.name} —{" "}
                          <span className="font-mono text-forest font-semibold">
                            {formatNaira(total)}
                          </span>
                        </p>
                      </div>

                      <dl className="pt-3 border-t border-linen grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Buyer
                          </dt>
                          <dd className="mt-0.5 font-medium text-espresso truncate">
                            {fields.buyerName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Email
                          </dt>
                          <dd className="mt-0.5 font-medium text-espresso truncate">
                            {fields.buyerEmail}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Phone
                          </dt>
                          <dd className="mt-0.5 font-mono font-medium text-espresso">
                            {fields.buyerPhone}
                          </dd>
                        </div>
                      </dl>

                      <div className="pt-3 border-t border-linen flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-espresso">
                          Total to transfer
                        </span>
                        <output
                          aria-label="Order total"
                          aria-live="polite"
                          className="font-mono font-bold text-2xl text-forest"
                        >
                          {formatNaira(total)}
                        </output>
                      </div>
                    </div>

                    <div className="bg-warm-canvas rounded-xl border border-linen p-5 space-y-4">
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ochre">
                          Payment Step A
                        </span>
                        <h4 className="mt-1 font-bold text-base text-espresso">
                          Transfer the exact total from your banking app
                        </h4>
                      </div>

                      {bank ? (
                        <>
                          <p className="text-xs font-semibold text-espresso">
                            {bank.bank_name} · {bank.account_name}
                          </p>

                          <div className="p-3 rounded-lg bg-white border border-linen flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-lg text-forest tracking-wider">
                              {bank.account_number}
                            </span>
                            <button
                              className="min-h-[48px] px-3 py-1.5 rounded-lg bg-warm-canvas border border-linen text-forest text-xs font-semibold hover:border-forest inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    bank.account_number,
                                  );
                                  setCopiedAccount(true);
                                  setTimeout(
                                    () => setCopiedAccount(false),
                                    2000,
                                  );
                                } catch {
                                  // Ignore clipboard refusal
                                }
                              }}
                              type="button"
                            >
                              {copiedAccount ? (
                                <>
                                  <Check className="w-4 h-4 text-forest" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4 text-forest" />
                                  <span>Copy Account</span>
                                </>
                              )}
                            </button>
                          </div>

                          {bank.instructions && (
                            <p className="text-xs text-body leading-relaxed">
                              {bank.instructions}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted leading-relaxed">
                          Treasury account details are being confirmed — try
                          again shortly.
                        </p>
                      )}

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Transfer Narration
                          </span>
                          <button
                            className="min-h-[48px] text-xs font-semibold text-forest hover:underline inline-flex items-center gap-1 cursor-pointer"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  narrationText,
                                );
                                setCopiedNarration(true);
                                setTimeout(
                                  () => setCopiedNarration(false),
                                  2000,
                                );
                              } catch {
                                // Ignore clipboard refusal
                              }
                            }}
                            type="button"
                          >
                            {copiedNarration ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-forest" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-forest" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="px-3 py-2.5 rounded-lg bg-white border border-linen font-mono text-xs text-espresso break-all">
                          {narrationText}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-white border border-linen flex items-start gap-2.5">
                        <Shield
                          className="w-4 h-4 text-ochre shrink-0 mt-0.5"
                          strokeWidth={2}
                        />
                        <p className="text-xs text-body leading-relaxed">
                          Use this exact transfer narration so the committee can
                          match your payment against the bank statement.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-6 space-y-4">
                    <div className="bg-white rounded-xl border border-linen p-5 space-y-4">
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ochre">
                          Payment Step B
                        </span>
                        <h4 className="mt-1 font-bold text-base text-espresso">
                          Upload your transfer receipt
                        </h4>
                        <p className="mt-1 text-xs text-body">
                          Attach the transfer screenshot or PDF receipt from
                          your banking app so our officer can verify and confirm
                          your order.
                        </p>
                      </div>

                      <div>
                        <label
                          className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-2"
                          htmlFor={`receipt-upload-${event.id}`}
                        >
                          Proof of payment (PDF, JPG, PNG · 4 MB max)
                        </label>

                        <input
                          accept="image/png,image/jpeg,application/pdf"
                          className="sr-only"
                          id={`receipt-upload-${event.id}`}
                          name="receipt"
                          onChange={(e) =>
                            handleFileChange(e.target.files?.[0] ?? null)
                          }
                          ref={fileInputRef}
                          type="file"
                        />

                        {!receiptFile ? (
                          // biome-ignore lint/a11y/useSemanticElements: file dropzone container
                          <div
                            aria-describedby={`file-hint-${event.id}`}
                            className={`min-h-[132px] p-6 rounded-xl border-2 border-dashed bg-warm-canvas flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                              fileError
                                ? "border-terra"
                                : "border-linen hover:border-forest"
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                fileInputRef.current?.click();
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <Upload
                              className="w-6 h-6 text-forest mb-2"
                              strokeWidth={2}
                            />
                            <span className="text-sm font-semibold text-espresso">
                              Choose transfer receipt or drag it here
                            </span>
                            <span
                              className="mt-1 text-xs text-muted"
                              id={`file-hint-${event.id}`}
                            >
                              Screenshot or PDF from your banking app (up to 4
                              MB)
                            </span>
                          </div>
                        ) : (
                          <div
                            aria-live="polite"
                            className="p-4 rounded-xl border border-forest bg-forest/5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText
                                className="w-5 h-5 text-forest shrink-0"
                                strokeWidth={2}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-espresso truncate">
                                  {receiptFile.name}
                                </p>
                                <p className="text-xs font-mono text-muted">
                                  {formatFileSize(receiptFile.size)} · Ready to
                                  submit
                                </p>
                              </div>
                            </div>
                            <button
                              className="min-h-[48px] px-3 py-1.5 rounded-lg bg-white border border-linen text-terra text-xs font-semibold hover:border-terra inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                              onClick={() => {
                                setReceiptFile(null);
                                setFileError(null);
                                if (fileInputRef.current) {
                                  fileInputRef.current.value = "";
                                }
                              }}
                              type="button"
                            >
                              <X
                                className="w-4 h-4 text-terra"
                                strokeWidth={2}
                              />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}

                        {fileError && (
                          <p className="mt-1.5 text-xs font-medium text-terra">
                            {fileError}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-linen">
                        <button
                          className={`w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors ${
                            canSubmit
                              ? "bg-forest hover:bg-deep-forest-hover text-white cursor-pointer"
                              : "bg-linen text-muted cursor-not-allowed"
                          }`}
                          disabled={!canSubmit}
                          type="submit"
                        >
                          {isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                              <span>Submitting…</span>
                            </>
                          ) : (
                            <span>Submit Order · {formatNaira(total)}</span>
                          )}
                        </button>

                        {!receiptFile && !fileError && !isPending && (
                          <p
                            aria-live="polite"
                            className="mt-2 text-xs text-muted leading-relaxed"
                          >
                            Upload your transfer receipt (PDF, JPG, or PNG) to
                            submit your order.
                          </p>
                        )}

                        <p className="mt-3 text-xs text-body leading-relaxed">
                          Submitting an order logs your request for review. Your
                          tickets are confirmed once an officer verifies your
                          transfer.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function CheckoutStepIndicator({ step }: { step: 1 | 2 }) {
  const labels = ["Choose your tickets", "Payment & receipt"];
  return (
    <nav
      aria-label="Ticket order steps"
      className="p-3 rounded-xl bg-warm-canvas border border-linen"
    >
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {labels.map((label, index) => {
          const number = (index + 1) as 1 | 2;
          const isActive = number === step;
          const isDone = number < step;
          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
                isActive
                  ? "bg-white border-forest text-espresso ring-2 ring-forest/20"
                  : "bg-white/60 border-linen text-muted"
              }`}
              key={label}
            >
              <span
                className={`w-6 h-6 rounded-full font-mono text-xs font-bold grid place-items-center shrink-0 ${
                  isActive || isDone
                    ? "bg-forest text-white"
                    : "bg-white border border-linen text-muted"
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                ) : (
                  number
                )}
              </span>
              <span>
                {number}. {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
