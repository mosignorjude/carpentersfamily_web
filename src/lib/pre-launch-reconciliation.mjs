/**
 * Pure validation and calculation helpers for pre-launch financial records,
 * club bank details onboarding, and historical dues reconciliation.
 */

/**
 * Approved statutory dues rate per month in NGN for 2026.
 */
export const STATUTORY_MONTHLY_DUES_NGN = 5000;

/**
 * Valid pre-launch months (February 1, 2026 through September 1, 2026).
 * Pre-launch operations commenced in February 2026; live portal launch is October 2026.
 */
export const VALID_PRE_LAUNCH_MONTHS = Object.freeze([
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
]);

/**
 * Validates a Nigerian Uniform Bank Account Number (NUBAN).
 * Strictly requires exactly 10 digits.
 *
 * @param {unknown} accountNumber
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateNubanAccountNumber(accountNumber) {
  if (typeof accountNumber !== "string") {
    return {
      valid: false,
      error: "Account number must be a string",
    };
  }

  if (!/^[0-9]{10}$/.test(accountNumber)) {
    return {
      valid: false,
      error: "Account number must be exactly 10 digits (NUBAN format)",
    };
  }

  return { valid: true };
}

/**
 * Validates administrative input for club bank payment settings.
 *
 * @param {unknown} input
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateClubPaymentSettingsInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      error: "Payment settings input must be an object",
    };
  }

  if (typeof input.bankName !== "string" || input.bankName.trim() === "") {
    return {
      valid: false,
      error: "Bank name is required and cannot be empty",
    };
  }

  const rawAccountNumber =
    typeof input.accountNumber === "string"
      ? input.accountNumber.trim()
      : input.accountNumber;
  const nubanResult = validateNubanAccountNumber(rawAccountNumber);
  if (!nubanResult.valid) {
    return nubanResult;
  }

  if (
    typeof input.accountName !== "string" ||
    input.accountName.trim() === ""
  ) {
    return {
      valid: false,
      error: "Account name is required and cannot be empty",
    };
  }

  if (
    input.instructions !== undefined &&
    input.instructions !== null &&
    typeof input.instructions !== "string"
  ) {
    return {
      valid: false,
      error: "Instructions must be a text string if provided",
    };
  }

  return { valid: true };
}

/**
 * Validates a list of historical months for dues reconciliation.
 * Must be a non-empty subset of VALID_PRE_LAUNCH_MONTHS with no duplicates.
 *
 * @param {unknown} months
 * @returns {{ valid: boolean; normalizedMonths: string[]; error?: string }}
 */
export function validateBackfillMonths(months) {
  if (!Array.isArray(months)) {
    return {
      valid: false,
      normalizedMonths: [],
      error: "Months must be an array of date strings",
    };
  }

  if (months.length === 0) {
    return {
      valid: false,
      normalizedMonths: [],
      error: "At least one month must be selected for reconciliation",
    };
  }

  const validSet = new Set(VALID_PRE_LAUNCH_MONTHS);
  const seen = new Set();
  const normalizedList = [];

  for (const rawMonth of months) {
    if (typeof rawMonth !== "string") {
      return {
        valid: false,
        normalizedMonths: [],
        error: "Each month must be a valid date string",
      };
    }

    const trimmed = rawMonth.trim();
    const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(trimmed);
    if (!match) {
      return {
        valid: false,
        normalizedMonths: [],
        error: `Invalid month format: "${rawMonth}". Expected format YYYY-MM-01 or YYYY-MM`,
      };
    }

    const normalized = `${match[1]}-${match[2]}-01`;

    if (seen.has(normalized)) {
      return {
        valid: false,
        normalizedMonths: [],
        error: `Duplicate month detected: ${normalized}`,
      };
    }
    seen.add(normalized);

    if (!validSet.has(normalized)) {
      if (normalized < "2026-02-01") {
        return {
          valid: false,
          normalizedMonths: [],
          error: `Month ${normalized} is before pre-launch period (February 2026)`,
        };
      }
      if (normalized > "2026-09-01") {
        return {
          valid: false,
          normalizedMonths: [],
          error: `Month ${normalized} is after pre-launch period (September 2026) or at launch`,
        };
      }
      return {
        valid: false,
        normalizedMonths: [],
        error: `Month ${normalized} is not a valid pre-launch month`,
      };
    }

    normalizedList.push(normalized);
  }

  normalizedList.sort();

  return {
    valid: true,
    normalizedMonths: normalizedList,
  };
}

/**
 * Calculates the total backfill amount in NGN for a given number of months.
 * Uses the approved statutory rate of ₦5,000 per month.
 *
 * @param {unknown} monthCount
 * @returns {number}
 */
export function calculateBackfillAmount(monthCount) {
  const count = Number(monthCount);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count) * STATUTORY_MONTHLY_DUES_NGN;
}

/**
 * @typedef {Object} ClubPaymentSettings
 * @property {string} bankName
 * @property {string} accountNumber
 * @property {string} accountName
 * @property {string} [instructions]
 */

/**
 * Formats club bank account details for member dues payment modal presentation,
 * handling missing configuration gracefully with pending verification state.
 *
 * @param {ClubPaymentSettings | null | undefined} paymentSettings
 * @returns {{
 *   isConfigured: boolean;
 *   bankName: string;
 *   accountName: string;
 *   accountNumber: string;
 *   instructions?: string;
 *   displayBankTitle: string;
 *   displayAccountNumber: string;
 *   copyDisabled: boolean;
 *   pendingNotice: string;
 * }}
 */
export function formatClubBankPresentation(paymentSettings) {
  if (
    !paymentSettings ||
    typeof paymentSettings !== "object" ||
    !paymentSettings.bankName ||
    !paymentSettings.accountNumber ||
    !paymentSettings.accountName
  ) {
    return {
      isConfigured: false,
      bankName: "",
      accountName: "",
      accountNumber: "",
      instructions: undefined,
      displayBankTitle: "Club bank details verification pending",
      displayAccountNumber: "Pending verification",
      copyDisabled: true,
      pendingNotice:
        "Official bank account details are currently being verified by club administration.",
    };
  }

  const instructions =
    typeof paymentSettings.instructions === "string" &&
    paymentSettings.instructions.trim().length > 0
      ? paymentSettings.instructions.trim()
      : undefined;

  return {
    isConfigured: true,
    bankName: paymentSettings.bankName,
    accountName: paymentSettings.accountName,
    accountNumber: paymentSettings.accountNumber,
    instructions,
    displayBankTitle: `${paymentSettings.bankName} · ${paymentSettings.accountName}`,
    displayAccountNumber: paymentSettings.accountNumber,
    copyDisabled: false,
    pendingNotice: "",
  };
}
