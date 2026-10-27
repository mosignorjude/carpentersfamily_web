"use client";

import { AlertTriangle, Plus, ShieldAlert, Ticket, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createEventTicketTierAction,
  retireEventTicketTierAction,
  updateEventTicketTierAction,
} from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormSubmitButton } from "@/components/ui/cf-button";
import { FormFieldError } from "@/components/ui/form-feedback";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { DashboardTicketTier } from "../dashboard-types";

interface EventTicketTierModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  mode: "create" | "edit" | "retire";
  tier?: DashboardTicketTier | null;
}

export function EventTicketTierModal({
  isOpen,
  onClose,
  eventId,
  mode,
  tier,
}: EventTicketTierModalProps) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  useModalHygiene({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setCapacity("");
      setReason("");
      setFieldErrors({});
      return;
    }

    if (tier && (mode === "edit" || mode === "retire")) {
      setName(tier.name);
      setCapacity(String(tier.capacity));
      setReason("");
      setFieldErrors({});
    } else {
      setName("");
      setCapacity("100");
      setReason("");
      setFieldErrors({});
    }
  }, [isOpen, mode, tier]);

  if (!isOpen) return null;

  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const isRetire = mode === "retire";

  const formAction = isCreate
    ? createEventTicketTierAction
    : isEdit
      ? updateEventTicketTierAction
      : retireEventTicketTierAction;

  const modalTitle = isCreate
    ? "Create Admission Tier"
    : isEdit
      ? "Edit Admission Tier"
      : "Retire Admission Tier";

  const modalSubtitle = isCreate
    ? "Configure a new ticket tier and pricing capacity for this event."
    : isEdit
      ? `Update pricing or capacity parameters for ${tier?.name ?? "this tier"}.`
      : `Retire ${tier?.name ?? "this tier"} from active ticket inventory.`;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const formData = new FormData(form);
    const errors: Record<string, string> = {};

    if (!isRetire) {
      const nameVal = String(formData.get("name") || "").trim();
      if (!nameVal) {
        errors.name = "Please enter tier name.";
      }

      const priceVal = String(formData.get("price_ngn") || "").trim();
      if (!priceVal) {
        errors.price_ngn = "Please enter price.";
      }

      const capVal = Number(formData.get("capacity"));
      if (!capVal || capVal <= 0) {
        errors.capacity = "Please enter capacity.";
      }
    }

    if (!isCreate) {
      const reasonVal = String(formData.get("reason") || "").trim();
      if (!reasonVal) {
        errors.reason = "Please enter audit reason.";
      }
    }

    if (Object.keys(errors).length > 0) {
      e.preventDefault();
      setFieldErrors(errors);
    }
  };

  return (
    <div
      aria-labelledby="tier-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isRetire
                  ? "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                  : "bg-[#174C37]/10 text-[#174C37]"
              }`}
            >
              {isRetire ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Ticket className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="tier-modal-title"
              >
                {modalTitle}
              </h3>
              <p className="text-xs text-[#7A685D]">{modalSubtitle}</p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          action={formAction}
          className="p-6 space-y-4 text-xs"
          noValidate
          onSubmit={handleSubmit}
        >
          <input name="event_id" type="hidden" value={eventId} />
          <input name="return_tab" type="hidden" value="tickets" />
          {!isCreate && tier && (
            <input name="tier_id" type="hidden" value={tier.id} />
          )}

          {/* Retire Mode Warning */}
          {isRetire && tier && (
            <div className="p-3.5 rounded-xl bg-[#BA3C2A]/5 border border-[#BA3C2A]/20 space-y-2 text-[#5C4638]">
              <div className="flex items-start gap-2 text-[#BA3C2A] font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Notice on Retiring Admission Tiers</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Retiring <strong>{tier.name}</strong> will prevent any future
                ticket issuance under this tier. Already issued passes (
                {tier.sold} pass{tier.sold === 1 ? "" : "es"}) remain valid and
                tallied in the ledger.
              </p>
              <div className="pt-2 border-t border-[#BA3C2A]/10 flex justify-between items-baseline font-mono text-[11px]">
                <span>Issued Passes: {tier.sold}</span>
                <span>Unit Price: {formatNaira(tier.price)}</span>
              </div>
            </div>
          )}

          {/* Create & Edit Fields */}
          {!isRetire && (
            <>
              {/* Tier Name */}
              <div className="space-y-1.5">
                <label
                  className="block font-semibold text-[#3D291F]"
                  htmlFor="ticket-tier-name"
                >
                  Tier Name <span className="text-[#BA3C2A]">*</span>
                </label>
                <input
                  aria-describedby={
                    fieldErrors.name ? "tier-error-name" : undefined
                  }
                  aria-invalid={fieldErrors.name ? "true" : undefined}
                  className={`w-full h-10 px-3 text-xs bg-white border rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 ${
                    fieldErrors.name
                      ? "border-[#BA3C2A] focus:ring-[#BA3C2A]"
                      : "border-[#E5DDD3] focus:ring-[#174C37]"
                  }`}
                  id="ticket-tier-name"
                  maxLength={80}
                  name="name"
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError("name");
                  }}
                  placeholder="e.g. VIP Admission, Early Bird, General Pass..."
                  value={name}
                />
                <FormFieldError
                  id="tier-error-name"
                  message={fieldErrors.name}
                />
              </div>

              {/* Price & Capacity Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="block font-semibold text-[#3D291F]"
                    htmlFor="ticket-tier-price"
                  >
                    Ticket Price (NGN) <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <FormattedAmountInput
                    aria-describedby={
                      fieldErrors.price_ngn ? "tier-error-price" : undefined
                    }
                    aria-invalid={fieldErrors.price_ngn ? "true" : undefined}
                    className={`w-full h-10 px-3 text-xs bg-white border rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 font-mono ${
                      fieldErrors.price_ngn
                        ? "border-[#BA3C2A] focus:ring-[#BA3C2A]"
                        : "border-[#E5DDD3] focus:ring-[#174C37]"
                    }`}
                    defaultValue={tier ? String(tier.price) : "0"}
                    id="ticket-tier-price"
                    name="price_ngn"
                    onChange={() => clearFieldError("price_ngn")}
                    placeholder="0"
                  />
                  <FormFieldError
                    id="tier-error-price"
                    message={fieldErrors.price_ngn}
                  />
                  <span className="text-[10px] text-[#7A685D] block">
                    Use 0 for complimentary or free admission.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block font-semibold text-[#3D291F]"
                    htmlFor="ticket-tier-capacity"
                  >
                    Capacity (Passes) <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    aria-describedby={
                      fieldErrors.capacity ? "tier-error-capacity" : undefined
                    }
                    aria-invalid={fieldErrors.capacity ? "true" : undefined}
                    className={`w-full h-10 px-3 text-xs bg-white border rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 font-mono ${
                      fieldErrors.capacity
                        ? "border-[#BA3C2A] focus:ring-[#BA3C2A]"
                        : "border-[#E5DDD3] focus:ring-[#174C37]"
                    }`}
                    id="ticket-tier-capacity"
                    max={100_000}
                    min={tier ? Math.max(1, tier.sold) : 1}
                    name="capacity"
                    onChange={(e) => {
                      setCapacity(e.target.value);
                      clearFieldError("capacity");
                    }}
                    placeholder="100"
                    type="number"
                    value={capacity}
                  />
                  <FormFieldError
                    id="tier-error-capacity"
                    message={fieldErrors.capacity}
                  />
                  <span className="text-[10px] text-[#7A685D] block">
                    {tier && tier.sold > 0
                      ? `Minimum ${tier.sold} (already sold).`
                      : "Maximum 100,000 passes."}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Audit Reason Field (Required for edit and retire; hidden default for create) */}
          {isCreate ? (
            <input
              name="reason"
              type="hidden"
              value="Initial admission tier entry"
            />
          ) : (
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#3D291F]"
                htmlFor="ticket-tier-reason"
              >
                Audit Reason <span className="text-[#BA3C2A]">*</span>
              </label>
              <textarea
                aria-describedby={
                  fieldErrors.reason ? "tier-error-reason" : undefined
                }
                aria-invalid={fieldErrors.reason ? "true" : undefined}
                className={`w-full p-3 text-xs bg-white border rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 resize-none ${
                  fieldErrors.reason
                    ? "border-[#BA3C2A] focus:ring-[#BA3C2A]"
                    : "border-[#E5DDD3] focus:ring-[#174C37]"
                }`}
                id="ticket-tier-reason"
                maxLength={500}
                name="reason"
                onChange={(e) => {
                  setReason(e.target.value);
                  clearFieldError("reason");
                }}
                placeholder={
                  isRetire
                    ? "Explain why this tier is being retired (e.g. Sales quota reached, superseded by VIP II)..."
                    : "Explain why this tier's parameters are changing..."
                }
                rows={3}
                value={reason}
              />
              <FormFieldError
                id="tier-error-reason"
                message={fieldErrors.reason}
              />
              <div className="flex justify-between items-center text-[10px] text-[#7A685D]">
                <span>Required for club governance compliance.</span>
                <span>{reason.length}/500</span>
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-[#E5DDD3] flex items-center justify-end gap-2.5">
            <button
              className="px-4 py-2 border border-[#E5DDD3] bg-white text-[#5C4638] hover:bg-[#FAF6F0] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <FormSubmitButton
              className={`px-5 py-2 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isRetire
                  ? "bg-[#BA3C2A] hover:bg-[#962F20]"
                  : "bg-[#174C37] hover:bg-[#123B2B]"
              }`}
              id="btn-submit-ticket-tier"
              pendingLabel={
                isRetire
                  ? "Retiring..."
                  : isEdit
                    ? "Updating..."
                    : "Creating..."
              }
            >
              {isRetire ? (
                "Retire Tier"
              ) : isEdit ? (
                "Save Changes"
              ) : (
                <span className="flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Tier</span>
                </span>
              )}
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
