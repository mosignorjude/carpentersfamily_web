"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Loader2,
  Shield,
  Ticket,
  Upload,
  X,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

  const handleClose = useCallback(() => {
    if (typeof window !== "undefined") {
      const search = buildCheckoutQuery(window.location.search, null);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${search}`,
      );
    }
    onClose();
  }, [onClose]);

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

  // Active step in 3-step checkout workflow:
  // Step 1: Choose Your Ticket
  // Step 2: Enter Your Details
  // Step 3: Payment & Receipt
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(() => {
    if (checkout.step === 2 && canContinue) return 3;
    return 1;
  });

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

  // Shorter transfer narration per requirement: TICKETS-SLKRAVE-[name]
  const buyerSuffix = fields.buyerName.trim()
    ? fields.buyerName.trim().toUpperCase()
    : "NAME";
  const eventSlug =
    event.title.toUpperCase().includes("ISSELE") ||
    event.title.toUpperCase().includes("RAVE")
      ? "SLKRAVE"
      : event.title
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 8)
          .toUpperCase() || "EVENT";
  const narrationText = `TICKETS-${eventSlug}-${buyerSuffix}`;

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
      className="fixed inset-0 z-[60] bg-espresso/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden"
      role="dialog"
    >
      <button
        aria-label="Close checkout overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0 min-h-[48px]"
        onClick={handleClose}
        tabIndex={-1}
        type="button"
      />

      <div
        className="relative z-10 w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl border border-linen shadow-2xl max-h-[calc(100dvh-0.5rem)] sm:max-h-[92dvh] flex flex-col overflow-hidden my-0 sm:my-auto outline-hidden"
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-linen bg-warm-canvas/60 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0 space-y-1">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-widest uppercase">
              TICKET CHECKOUT
            </span>
            <h2
              className="text-xl sm:text-2xl font-serif font-bold text-espresso truncate leading-tight"
              id="ticket-checkout-title"
            >
              {event.title}
            </h2>
            <p className="text-xs sm:text-sm text-body truncate">
              {formatEventLine(event.starts_at)} · {event.location}
            </p>
          </div>
          <button
            aria-label="Close checkout"
            className="w-11 h-11 min-h-[48px] min-w-[48px] shrink-0 rounded-2xl bg-white border border-linen hover:bg-warm-canvas flex items-center justify-center text-espresso transition-colors cursor-pointer shadow-2xs"
            onClick={handleClose}
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6 overscroll-contain">
          {/* 3-Step Navigation Tabs Bar */}
          <CheckoutStepIndicator
            canContinue={canContinue}
            onSelectStep={(s) => {
              if (s === 1) {
                setActiveStep(1);
                go({ step: 1 });
              } else if (s === 2 && tier !== null) {
                setActiveStep(2);
                go({ step: 1 });
              } else if (s === 3 && canContinue) {
                setActiveStep(3);
                go({ step: 2 });
              }
            }}
            step={activeStep}
          />

          {state && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-terra/10 border border-terra/30 text-espresso text-xs space-y-1"
            >
              <p className="font-bold text-terra">{state.title}</p>
              <p className="text-body leading-relaxed">{state.message}</p>
            </div>
          )}

          <form
            action={formAction}
            /* action={submitTicketOrderAction} */
            className="space-y-6"
            encType="multipart/form-data"
            noValidate
            onSubmit={(e) => {
              if (activeStep === 1) {
                e.preventDefault();
                setActiveStep(2);
                return;
              }
              if (activeStep === 2) {
                e.preventDefault();
                setTouched({
                  name: true,
                  email: true,
                  phone: true,
                  file: false,
                });
                if (canContinue) {
                  setActiveStep(3);
                  go({ step: 2 });
                }
                return;
              }
              // Save last submitted order data to sessionStorage for order submitted screen
              try {
                window.sessionStorage.setItem(
                  "cf-last-submitted-order",
                  JSON.stringify({
                    eventId: event.id,
                    eventName: event.title,
                    tierName: tier?.name ?? "Ticket",
                    quantity,
                    total,
                    buyerName: fields.buyerName,
                    buyerEmail: fields.buyerEmail,
                    bankName: bank?.bank_name ?? "",
                    accountNumber: bank?.account_number ?? "",
                  }),
                );
              } catch {
                // Ignore storage write refusal
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

            {/* ===============================================================
                STEP 1 OF 3: CHOOSE YOUR TICKET
            ================================================================ */}
            {activeStep === 1 && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif font-bold text-xl sm:text-3xl text-espresso tracking-tight">
                      Choose Your Ticket
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-wider uppercase shrink-0">
                      1 OF 3
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-body">
                    Select your ticket tier and the number of tickets you want
                    to buy.
                  </p>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">
                    SELECT TICKET TIER
                  </span>
                  <div
                    aria-label={`Ticket tiers for ${event.title}`}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
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
                          className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[48px] cursor-pointer ${
                            isSoldOut
                              ? "border-linen bg-warm-canvas opacity-50 cursor-not-allowed"
                              : isSelected
                                ? "border-forest bg-forest/5 ring-2 ring-forest/20 shadow-xs"
                                : "border-linen bg-white hover:border-forest shadow-2xs"
                          }`}
                          disabled={isSoldOut}
                          key={t.id}
                          onClick={() => handleSelectTier(t.id)}
                          role="radio"
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3 w-full">
                            <span className="font-bold text-sm sm:text-base text-espresso">
                              {t.name}
                            </span>
                            <span
                              className={`w-5 h-5 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? "border-forest bg-forest text-white"
                                  : "border-linen bg-white"
                              }`}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-white" />
                              )}
                            </span>
                          </div>

                          <div className="mt-4 flex items-baseline justify-between gap-2 w-full pt-2 border-t border-linen/60">
                            <span className="font-mono font-bold text-base sm:text-lg text-forest">
                              {formatNaira(Number(t.price_ngn))}
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                              {isSoldOut ? "SOLD OUT" : "AVAILABLE"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted"
                    htmlFor={`ticket-count-${event.id}`}
                  >
                    NUMBER OF TICKETS
                  </label>
                  <select
                    className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-linen bg-white text-espresso font-medium text-sm focus:border-forest outline-hidden"
                    id={`ticket-count-${event.id}`}
                    key={`qty-${tier?.id}`}
                    onChange={(e) =>
                      go({
                        quantity: clampQuantity(Number(e.target.value), maxQty),
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

                {/* Step 1 Selection Summary & Continue Button */}
                <div className="p-4 sm:p-5 rounded-2xl bg-warm-canvas border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                      SELECTION SUMMARY
                    </span>
                    <p className="mt-1 text-sm sm:text-base font-semibold text-espresso">
                      {quantity} × {tier?.name ?? "Ticket"} —{" "}
                      <span className="font-mono font-bold text-lg sm:text-xl text-forest">
                        {formatNaira(total)}
                      </span>
                    </p>
                  </div>

                  <button
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-forest hover:bg-deep-forest-hover text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                    disabled={!tier}
                    onClick={() => setActiveStep(2)}
                    type="button"
                  >
                    <span>Continue</span>
                    <ArrowRight
                      className="w-4 h-4 text-ochre"
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* ===============================================================
                STEP 2 OF 3: ENTER YOUR DETAILS
            ================================================================ */}
            {activeStep === 2 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="min-h-[48px] px-3.5 py-1.5 rounded-xl bg-white border border-linen text-forest text-xs font-semibold hover:border-forest inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    onClick={() => setActiveStep(1)}
                    type="button"
                  >
                    <ArrowLeft
                      className="w-3.5 h-3.5 text-forest"
                      strokeWidth={2}
                    />
                    <span>Back to Ticket</span>
                  </button>

                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-wider uppercase shrink-0">
                    STEP 2 OF 3
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-xl sm:text-3xl text-espresso tracking-tight">
                    Enter Your Details
                  </h3>
                  <p className="text-xs sm:text-sm text-body">
                    Provide your name, email address, and phone number so we can
                    log your order and email your confirmation.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                      htmlFor={`buyer-name-${event.id}`}
                    >
                      FULL NAME
                    </label>
                    <input
                      aria-describedby={
                        nameError ? `name-err-${event.id}` : undefined
                      }
                      aria-invalid={Boolean(nameError)}
                      autoComplete="name"
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border bg-white text-espresso text-sm placeholder:text-muted/60 focus:border-forest outline-hidden ${
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
                      placeholder="e.g. First and last name"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                        htmlFor={`buyer-email-${event.id}`}
                      >
                        EMAIL ADDRESS
                      </label>
                      <input
                        aria-describedby={
                          emailError ? `email-err-${event.id}` : undefined
                        }
                        aria-invalid={Boolean(emailError)}
                        autoComplete="email"
                        className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border bg-white text-espresso text-sm placeholder:text-muted/60 focus:border-forest outline-hidden ${
                          emailError ? "border-terra" : "border-linen"
                        }`}
                        id={`buyer-email-${event.id}`}
                        onBlur={() =>
                          setTouched((prev) => ({ ...prev, email: true }))
                        }
                        onChange={(e) =>
                          setFields((f) => ({
                            ...f,
                            buyerEmail: e.target.value,
                          }))
                        }
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

                    <div>
                      <label
                        className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5"
                        htmlFor={`buyer-phone-${event.id}`}
                      >
                        PHONE NUMBER
                      </label>
                      <input
                        aria-describedby={
                          phoneError ? `phone-err-${event.id}` : undefined
                        }
                        aria-invalid={Boolean(phoneError)}
                        autoComplete="tel"
                        className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border bg-white text-espresso text-sm placeholder:text-muted/60 focus:border-forest outline-hidden ${
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
                        placeholder="0803 456 7890"
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
                </div>

                {/* Step 2 Selection Summary & Continue Button */}
                <div className="p-4 sm:p-5 rounded-2xl bg-warm-canvas border border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                      SELECTION SUMMARY
                    </span>
                    <p className="mt-1 text-sm sm:text-base font-semibold text-espresso">
                      {quantity} × {tier?.name ?? "Ticket"} —{" "}
                      <span className="font-mono font-bold text-lg sm:text-xl text-forest">
                        {formatNaira(total)}
                      </span>
                    </p>
                    {missing.length > 0 && touched.name && (
                      <p aria-live="polite" className="mt-1 text-xs text-terra">
                        Please provide your {missing.join(", ")} to proceed.
                      </p>
                    )}
                  </div>

                  <button
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-forest hover:bg-deep-forest-hover text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                    disabled={!canContinue}
                    onClick={() => {
                      setTouched({
                        name: true,
                        email: true,
                        phone: true,
                        file: false,
                      });
                      if (canContinue) {
                        setActiveStep(3);
                        go({ step: 2 });
                      }
                    }}
                    type="button"
                  >
                    <span>Continue to Payment</span>
                    <ArrowRight
                      className="w-4 h-4 text-ochre"
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* ===============================================================
                STEP 3 OF 3: PAYMENT & RECEIPT
            ================================================================ */}
            {activeStep === 3 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="min-h-[48px] px-3.5 py-1.5 rounded-xl bg-white border border-linen text-forest text-xs font-semibold hover:border-forest inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    onClick={() => {
                      setActiveStep(2);
                      go({ step: 1 });
                    }}
                    type="button"
                  >
                    <ArrowLeft
                      className="w-3.5 h-3.5 text-forest"
                      strokeWidth={2}
                    />
                    <span>Back to Details</span>
                  </button>

                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-forest/10 text-forest text-[11px] font-bold tracking-wider uppercase shrink-0">
                    STEP 3 OF 3
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Order Summary & Payment Step A */}
                  <div className="lg:col-span-6 space-y-4">
                    {/* Order Summary Card */}
                    <div className="bg-warm-canvas rounded-2xl border border-linen p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          ORDER SUMMARY
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            className="min-h-[48px] text-xs font-semibold text-forest hover:underline cursor-pointer"
                            onClick={() => {
                              setActiveStep(1);
                              go({ step: 1 });
                            }}
                            type="button"
                          >
                            Change ticket
                          </button>
                          <span className="text-muted text-xs">·</span>
                          <button
                            className="min-h-[48px] text-xs font-semibold text-forest hover:underline cursor-pointer"
                            onClick={() => {
                              setActiveStep(2);
                              go({ step: 1 });
                            }}
                            type="button"
                          >
                            Edit details
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="font-serif font-bold text-lg text-espresso">
                          {event.title}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-espresso">
                          {quantity} × {tier?.name} —{" "}
                          <span className="font-mono text-forest font-bold">
                            {formatNaira(total)}
                          </span>
                        </p>
                      </div>

                      <dl className="pt-3 border-t border-linen grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            BUYER
                          </dt>
                          <dd className="mt-0.5 font-medium text-espresso truncate">
                            {fields.buyerName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            EMAIL
                          </dt>
                          <dd className="mt-0.5 font-medium text-espresso truncate">
                            {fields.buyerEmail}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            PHONE
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

                    {/* Payment Step A Card */}
                    <div className="bg-warm-canvas rounded-2xl border border-linen p-5 space-y-4">
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ochre">
                          STEP A · BANK TRANSFER
                        </span>
                        <h4 className="mt-1 font-serif font-bold text-base sm:text-lg text-espresso">
                          Transfer the exact total from your banking app
                        </h4>
                      </div>

                      {/* Clear Distinction of Bank and Account Name per Requirement */}
                      {bank ? (
                        <>
                          <div className="p-3.5 rounded-xl bg-white border border-linen space-y-2">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="font-bold text-muted uppercase tracking-wider text-[11px]">
                                Bank:
                              </span>
                              <span className="font-extrabold text-espresso">
                                {bank.bank_name}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs sm:text-sm pt-2 border-t border-linen">
                              <span className="font-bold text-muted uppercase tracking-wider text-[11px]">
                                Acct Name:
                              </span>
                              <span className="font-extrabold text-espresso">
                                {bank.account_name}
                              </span>
                            </div>
                          </div>

                          {/* Account Number Box with Copy Action */}
                          <div className="p-3 rounded-xl bg-white border border-linen flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-lg text-forest tracking-wider">
                              {bank.account_number}
                            </span>
                            <button
                              className="min-h-[48px] px-3.5 py-1.5 rounded-lg bg-warm-canvas border border-linen text-forest text-xs font-semibold hover:border-forest inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
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
                                  <span>Copy account number</span>
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="p-4 rounded-xl bg-white border border-terra/30 text-xs text-terra">
                          Bank transfer details are temporarily unavailable.
                          Please refresh or try again shortly.
                        </div>
                      )}

                      {/* Shorter Copiable Transfer Narration */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            TRANSFER NARRATION
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
                        <div className="px-3 py-2.5 rounded-xl bg-white border border-linen font-mono text-xs font-semibold text-espresso break-all">
                          {narrationText}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-linen flex items-start gap-2.5">
                        <Shield
                          className="w-4 h-4 text-ochre shrink-0 mt-0.5"
                          strokeWidth={2}
                        />
                        <p className="text-xs text-body leading-relaxed">
                          Use this exact transfer narration so our committee can
                          match your payment against the bank statement.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Payment Step B (Upload Transfer Receipt) */}
                  <div className="lg:col-span-6 space-y-4">
                    <div className="bg-white rounded-2xl border border-linen p-5 sm:p-6 space-y-5 shadow-xs">
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ochre">
                          STEP B · UPLOAD RECEIPT
                        </span>
                        <h4 className="mt-1 font-serif font-bold text-base sm:text-lg text-espresso">
                          Upload your transfer receipt
                        </h4>
                        <p className="mt-1 text-xs text-body leading-relaxed">
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
                          PROOF OF PAYMENT (PDF, JPG, PNG · 4 MB MAX)
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
                            className={`min-h-[140px] p-6 rounded-2xl border-2 border-dashed bg-warm-canvas flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
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
                              className="min-h-[48px] px-3.5 py-1.5 rounded-lg bg-white border border-linen text-terra text-xs font-semibold hover:border-terra inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
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

                      <div className="pt-2">
                        <button
                          className={`w-full min-h-[48px] px-5 py-3.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors shadow-2xs ${
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
                            className="mt-2 text-xs text-muted text-center"
                          >
                            Upload your transfer receipt (PDF, JPG, or PNG) to
                            submit.
                          </p>
                        )}

                        {/* Exact Footnote Text per Requirement */}
                        <p className="mt-3.5 text-xs text-body text-center leading-relaxed">
                          Submitting logs your purchase for a quick review. Your
                          seats are not held until your transfer is verified.
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

function CheckoutStepIndicator({
  step,
  canContinue,
  onSelectStep,
}: {
  step: 1 | 2 | 3;
  canContinue: boolean;
  onSelectStep: (step: 1 | 2 | 3) => void;
}) {
  const steps = [
    { number: 1, shortLabel: "Ticket", fullLabel: "Choose Ticket" },
    { number: 2, shortLabel: "Details", fullLabel: "Enter Details" },
    { number: 3, shortLabel: "Payment", fullLabel: "Payment" },
  ] as const;

  return (
    <nav
      aria-label="Ticket purchase steps"
      className="p-1.5 sm:p-2 rounded-2xl bg-warm-canvas border border-linen"
    >
      <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {steps.map((s) => {
          const isActive = s.number === step;
          const isDone = s.number < step;
          const isClickable =
            s.number === 1 || s.number === 2 || (s.number === 3 && canContinue);

          return (
            <li key={s.number}>
              <button
                aria-current={isActive ? "step" : undefined}
                className={`w-full min-h-[48px] flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold text-left transition-all ${
                  isActive
                    ? "bg-white border-forest text-espresso ring-2 ring-forest/20 shadow-2xs"
                    : isDone
                      ? "bg-forest/10 border-forest/20 text-forest hover:bg-forest/15 cursor-pointer"
                      : "bg-white/60 border-linen text-muted"
                } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                disabled={!isClickable}
                onClick={() => onSelectStep(s.number)}
                type="button"
              >
                <span
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-mono text-[11px] sm:text-xs font-bold grid place-items-center shrink-0 ${
                    isActive || isDone
                      ? "bg-forest text-white"
                      : "bg-white border border-linen text-muted"
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                  ) : s.number === 1 ? (
                    <Ticket className="w-3 h-3 text-white" />
                  ) : (
                    s.number
                  )}
                </span>
                <span className="truncate text-[11px] sm:text-xs">
                  <span className="sm:hidden">{s.shortLabel}</span>
                  <span className="hidden sm:inline">{s.fullLabel}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
