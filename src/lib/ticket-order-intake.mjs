import { MAX_ONLINE_QUANTITY } from "./ticket-order-state.mjs";

/** Hidden field. A human never fills it; a generic bot almost always does. */
export const HONEYPOT_FIELD = "website";
/** Shorter than anyone actually typing a name, a phone and an email can manage. */
export const MIN_SUBMIT_SECONDS = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

function text(formData, name, { trim = true } = {}) {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const out = trim ? value.trim() : value;
  return out === "" ? null : out;
}

/**
 * The table's own buyer-name rule, applied here so a refusal is a notice rather than a 23514:
 * `event_ticket_sales_buyer_check` requires btrim equality, 1..160 and no control characters
 * (20261003102501:122-127).
 */
function isCleanName(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value === value.trim() &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control character check
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isHoneypotClean(formData) {
  const filled = formData.get(HONEYPOT_FIELD);
  return typeof filled !== "string" || filled.trim() === "";
}

export function isElapsedEnough(renderedAt, now = Date.now()) {
  if (typeof renderedAt !== "string") return false;
  const rendered = Date.parse(renderedAt);
  if (!Number.isFinite(rendered)) return false;
  const elapsedSeconds = (now - rendered) / 1000;
  return elapsedSeconds >= MIN_SUBMIT_SECONDS && elapsedSeconds < 86400;
}

/**
 * @param {FormData} formData
 * @param {{ now?: number }} [options]
 * @returns {{ ok: true, values: Record<string, string> } | { ok: false, notice: string }}
 */
export function parseTicketOrderForm(formData, options = {}) {
  const eventId = text(formData, "event_id");
  const tierId = text(formData, "tier_id");
  const rawQuantity = text(formData, "quantity");
  const buyerName = text(formData, "buyer_name");
  const rawEmail = text(formData, "buyer_email");
  const buyerPhone = text(formData, "buyer_phone");
  const idempotencyKey = text(formData, "idempotency_key");
  const saleId = text(formData, "sale_id");

  const quantity = Number.parseInt(rawQuantity ?? "", 10);
  const buyerEmail = rawEmail ? rawEmail.toLowerCase() : null;

  const failures = [
    !eventId || !UUID_PATTERN.test(eventId),
    !tierId || !UUID_PATTERN.test(tierId),
    !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ONLINE_QUANTITY,
    !isCleanName(buyerName),
    !buyerEmail ||
      buyerEmail.length < 3 ||
      buyerEmail.length > 320 ||
      !buyerEmail.includes("@") ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail),
    !buyerPhone || !PHONE_PATTERN.test(buyerPhone),
    !idempotencyKey || !UUID_PATTERN.test(idempotencyKey),
    !saleId || !UUID_PATTERN.test(saleId),
    !isHoneypotClean(formData),
    !isElapsedEnough(
      text(formData, "rendered_at", { trim: false }),
      options.now,
    ),
  ];

  if (failures.some(Boolean)) return { ok: false, notice: "invalid-request" };

  return {
    ok: true,
    values: {
      eventId,
      tierId,
      quantity: String(quantity),
      buyerName,
      buyerEmail,
      buyerPhone,
      idempotencyKey,
      saleId,
    },
  };
}
