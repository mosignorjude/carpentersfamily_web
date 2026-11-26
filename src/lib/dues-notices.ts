export type DuesNotice = {
  message: string;
  variant: "success" | "error";
};

const DUES_NOTICES: Record<string, DuesNotice> = {
  saved: {
    message: "Payment recorded.",
    variant: "success",
  },
  "rate-saved": {
    message: "Monthly rate updated.",
    variant: "success",
  },
  "receipt-attached": {
    message: "Receipt attached to the dues payment.",
    variant: "success",
  },
  "dues-request-submitted": {
    message: "Payment submitted. An officer will review it soon.",
    variant: "success",
  },
  "dues-request-approved": {
    message: "Payment approved.",
    variant: "success",
  },
  "dues-request-rejected": {
    message: "Payment request declined.",
    variant: "error",
  },
  "historical-dues-reconciled": {
    message: "Past dues cleared.",
    variant: "success",
  },
  "invalid-reconciliation-months": {
    message:
      "Selected months are outside the pre-launch period (Feb–Sep 2026).",
    variant: "error",
  },
  "receipt-required": {
    message: "Upload a PDF, JPG, or PNG receipt for bank transfer payments.",
    variant: "error",
  },
  "receipt-invalid": {
    message:
      "Invalid receipt file. Upload a valid PDF, JPG, or PNG file up to 4 MiB.",
    variant: "error",
  },
  "receipt-upload-failed": {
    message: "Could not upload the receipt to storage. Please try again.",
    variant: "error",
  },
  "receipt-storage-unavailable": {
    message:
      "Receipt storage is temporarily unavailable. Please try again shortly.",
    variant: "error",
  },
  "receipt-not-allowed": {
    message: "A receipt cannot be attached for this payment method.",
    variant: "error",
  },
  "duplicate-record": {
    message:
      "At least one selected month already has a recorded or pending dues entry.",
    variant: "error",
  },
  "self-action-denied": {
    message:
      "Officers cannot record, approve, or attach receipts to their own dues.",
    variant: "error",
  },
  "dues-amount-mismatch": {
    message:
      "Payment amount must exactly equal the configured rate total for the selected months.",
    variant: "error",
  },
  "dues-month-outside-period": {
    message:
      "One or more selected months fall outside this member's dues eligibility period.",
    variant: "error",
  },
  "dues-member-exempt": {
    message:
      "Club Admins are exempt from statutory dues while holding the Admin role.",
    variant: "error",
  },
  denied: {
    message: "You do not have permission to do that.",
    variant: "error",
  },
  "invalid-request": {
    message: "Please check the details and try again.",
    variant: "error",
  },
  "operation-failed": {
    message:
      "Could not complete the request. Please check the details and try again.",
    variant: "error",
  },
};

export function getDuesNotice(code?: string): DuesNotice | undefined {
  if (!code || !Object.hasOwn(DUES_NOTICES, code)) return undefined;
  return DUES_NOTICES[code];
}
