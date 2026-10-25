import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VALID_PRE_LAUNCH_MONTHS,
  calculateBackfillAmount,
  validateBackfillMonths,
  validateClubPaymentSettingsInput,
  validateNubanAccountNumber,
} from "../src/lib/pre-launch-reconciliation.mjs";

describe("VALID_PRE_LAUNCH_MONTHS constant", () => {
  it("contains exactly 8 pre-launch months from February to September 2026", () => {
    assert.deepEqual(VALID_PRE_LAUNCH_MONTHS, [
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  it("is frozen to prevent accidental mutation", () => {
    assert.equal(Object.isFrozen(VALID_PRE_LAUNCH_MONTHS), true);
  });
});

describe("validateNubanAccountNumber", () => {
  it("accepts valid 10-digit NUBAN strings", () => {
    const validSamples = ["0123456789", "9876543210", "0000000000", "2048573912"];
    for (const num of validSamples) {
      const result = validateNubanAccountNumber(num);
      assert.equal(result.valid, true, `Expected ${num} to be valid`);
      assert.equal(result.error, undefined);
    }
  });

  it("rejects strings with fewer than 10 digits", () => {
    const shortSamples = ["", "1", "123", "123456789"];
    for (const num of shortSamples) {
      const result = validateNubanAccountNumber(num);
      assert.equal(result.valid, false, `Expected ${num} to be rejected for length`);
      assert.match(result.error, /10 digits/i);
    }
  });

  it("rejects strings with more than 10 digits", () => {
    const longSamples = ["01234567890", "123456789012345"];
    for (const num of longSamples) {
      const result = validateNubanAccountNumber(num);
      assert.equal(result.valid, false, `Expected ${num} to be rejected for length`);
      assert.match(result.error, /10 digits/i);
    }
  });

  it("rejects strings with non-numeric characters", () => {
    const nonNumericSamples = ["012345678a", "abcdefghij", "012-345-67", "01234 6789"];
    for (const num of nonNumericSamples) {
      const result = validateNubanAccountNumber(num);
      assert.equal(result.valid, false, `Expected ${num} to be rejected for non-numeric characters`);
      assert.match(result.error, /10 digits/i);
    }
  });

  it("rejects non-string values", () => {
    const nonStrings = [null, undefined, 1234567890, {}, []];
    for (const val of nonStrings) {
      const result = validateNubanAccountNumber(val);
      assert.equal(result.valid, false);
      assert.ok(result.error);
    }
  });
});

describe("validateClubPaymentSettingsInput", () => {
  it("accepts valid payment settings input with all fields", () => {
    const input = {
      bankName: "Zenith Bank",
      accountNumber: "0123456789",
      accountName: "The Carpenters Family Social Club",
      instructions: "Transfer with your full name as remark",
    };
    const result = validateClubPaymentSettingsInput(input);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it("accepts valid payment settings without optional instructions", () => {
    const input = {
      bankName: "First Bank of Nigeria",
      accountNumber: "9876543210",
      accountName: "Carpenters Family",
    };
    const result = validateClubPaymentSettingsInput(input);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it("trims whitespace around valid values", () => {
    const input = {
      bankName: "  GTBank  ",
      accountNumber: "  0123456789  ",
      accountName: "  Carpenters Club  ",
    };
    const result = validateClubPaymentSettingsInput(input);
    assert.equal(result.valid, true);
  });

  it("rejects missing, empty, or whitespace-only bank name", () => {
    for (const bankName of ["", "   ", null, undefined]) {
      const result = validateClubPaymentSettingsInput({
        bankName,
        accountNumber: "0123456789",
        accountName: "Carpenters Family",
      });
      assert.equal(result.valid, false);
      assert.match(result.error, /bank name/i);
    }
  });

  it("rejects invalid account numbers", () => {
    for (const accountNumber of ["123", "012345678a", "", null, undefined]) {
      const result = validateClubPaymentSettingsInput({
        bankName: "Access Bank",
        accountNumber,
        accountName: "Carpenters Family",
      });
      assert.equal(result.valid, false);
      assert.match(result.error, /10 digits|account number/i);
    }
  });

  it("rejects missing, empty, or whitespace-only account name", () => {
    for (const accountName of ["", "   ", null, undefined]) {
      const result = validateClubPaymentSettingsInput({
        bankName: "Access Bank",
        accountNumber: "0123456789",
        accountName,
      });
      assert.equal(result.valid, false);
      assert.match(result.error, /account name/i);
    }
  });

  it("rejects non-string instructions when supplied", () => {
    const result = validateClubPaymentSettingsInput({
      bankName: "Access Bank",
      accountNumber: "0123456789",
      accountName: "Carpenters Family",
      instructions: 12345,
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /instructions/i);
  });

  it("rejects non-object inputs", () => {
    for (const input of [null, undefined, "invalid", 123, []]) {
      const result = validateClubPaymentSettingsInput(input);
      assert.equal(result.valid, false);
      assert.ok(result.error);
    }
  });
});

describe("validateBackfillMonths", () => {
  it("accepts all 8 pre-launch months", () => {
    const months = [
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ];
    const result = validateBackfillMonths(months);
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalizedMonths, months);
    assert.equal(result.error, undefined);
  });

  it("accepts valid subsets of pre-launch months and returns them chronologically sorted", () => {
    const input = ["2026-06-01", "2026-02-01", "2026-04-01"];
    const result = validateBackfillMonths(input);
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalizedMonths, ["2026-02-01", "2026-04-01", "2026-06-01"]);
  });

  it("normalizes 'YYYY-MM' strings to 'YYYY-MM-01'", () => {
    const input = ["2026-03", "2026-02"];
    const result = validateBackfillMonths(input);
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalizedMonths, ["2026-02-01", "2026-03-01"]);
  });

  it("rejects January 2026 ('2026-01-01')", () => {
    const result = validateBackfillMonths(["2026-01-01", "2026-02-01"]);
    assert.equal(result.valid, false);
    assert.match(result.error, /2026-01-01|before/i);
  });

  it("rejects October 2026 post-launch month ('2026-10-01')", () => {
    const result = validateBackfillMonths(["2026-09-01", "2026-10-01"]);
    assert.equal(result.valid, false);
    assert.match(result.error, /2026-10-01|after|launch/i);
  });

  it("rejects other out-of-range months", () => {
    const outOfRange = [["2025-12-01"], ["2026-11-01"], ["2027-01-01"]];
    for (const months of outOfRange) {
      const result = validateBackfillMonths(months);
      assert.equal(result.valid, false);
      assert.ok(result.error);
    }
  });

  it("rejects duplicate months", () => {
    const duplicates = [
      ["2026-02-01", "2026-02-01"],
      ["2026-03-01", "2026-04-01", "2026-03-01"],
      ["2026-05", "2026-05-01"],
    ];
    for (const months of duplicates) {
      const result = validateBackfillMonths(months);
      assert.equal(result.valid, false);
      assert.match(result.error, /duplicate/i);
    }
  });

  it("rejects invalid date format strings or non-first-of-month dates", () => {
    const invalidFormats = [
      ["not-a-date"],
      ["2026-02-15"],
      ["2026-13-01"],
      ["2026-00-01"],
    ];
    for (const months of invalidFormats) {
      const result = validateBackfillMonths(months);
      assert.equal(result.valid, false);
      assert.ok(result.error);
    }
  });

  it("rejects empty array", () => {
    const result = validateBackfillMonths([]);
    assert.equal(result.valid, false);
    assert.match(result.error, /at least one month/i);
  });

  it("rejects non-array input", () => {
    for (const val of [null, undefined, "2026-02-01", 123, {}]) {
      const result = validateBackfillMonths(val);
      assert.equal(result.valid, false);
      assert.ok(result.error);
    }
  });
});

describe("calculateBackfillAmount", () => {
  it("calculates ₦5,000 per month for standard positive counts", () => {
    assert.equal(calculateBackfillAmount(1), 5000);
    assert.equal(calculateBackfillAmount(2), 10000);
    assert.equal(calculateBackfillAmount(4), 20000);
    assert.equal(calculateBackfillAmount(8), 40000);
  });

  it("returns 0 for 0 months", () => {
    assert.equal(calculateBackfillAmount(0), 0);
  });

  it("returns 0 for negative, non-numeric, or invalid numbers", () => {
    assert.equal(calculateBackfillAmount(-1), 0);
    assert.equal(calculateBackfillAmount(-5), 0);
    assert.equal(calculateBackfillAmount(NaN), 0);
    assert.equal(calculateBackfillAmount(Infinity), 0);
    assert.equal(calculateBackfillAmount(null), 0);
    assert.equal(calculateBackfillAmount(undefined), 0);
    assert.equal(calculateBackfillAmount("not-a-number"), 0);
  });

  it("handles string representations of integers", () => {
    assert.equal(calculateBackfillAmount("3"), 15000);
    assert.equal(calculateBackfillAmount("6"), 30000);
  });
});
