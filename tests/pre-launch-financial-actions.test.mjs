import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  STATUTORY_MONTHLY_DUES_NGN,
  VALID_PRE_LAUNCH_MONTHS,
  validateBackfillMonths,
  validateClubPaymentSettingsInput,
  validateNubanAccountNumber,
} from "../src/lib/pre-launch-reconciliation.mjs";

const actionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);

function extractActionBody(source, actionName) {
  const start = source.indexOf(`export async function ${actionName}(`);
  if (start === -1) return null;
  const nextAction = source.indexOf("export async function", start + 1);
  return source.slice(start, nextAction === -1 ? undefined : nextAction);
}

describe("Server actions export verification", () => {
  it("exports updateClubPaymentSettingsAction from src/app/actions.ts", () => {
    const body = extractActionBody(
      actionsSource,
      "updateClubPaymentSettingsAction",
    );
    assert.ok(
      body !== null,
      "updateClubPaymentSettingsAction must be exported from src/app/actions.ts",
    );
  });

  it("exports recordOpeningBalanceAction from src/app/actions.ts", () => {
    const body = extractActionBody(actionsSource, "recordOpeningBalanceAction");
    assert.ok(
      body !== null,
      "recordOpeningBalanceAction must be exported from src/app/actions.ts",
    );
  });

  it("exports backfillMemberHistoricalDuesAction from src/app/actions.ts", () => {
    const body = extractActionBody(
      actionsSource,
      "backfillMemberHistoricalDuesAction",
    );
    assert.ok(
      body !== null,
      "backfillMemberHistoricalDuesAction must be exported from src/app/actions.ts",
    );
  });
});

describe("updateClubPaymentSettingsAction structure and authorization", () => {
  const body = extractActionBody(
    actionsSource,
    "updateClubPaymentSettingsAction",
  );

  it("validates payment settings input using validateClubPaymentSettingsInput", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /validateClubPaymentSettingsInput/,
      "Must call validateClubPaymentSettingsInput",
    );
    assert.match(
      body,
      /invalid-payment-settings/,
      "Must redirect with invalid-payment-settings on validation failure",
    );
  });

  it("enforces admin or backup_admin authorization and rejects unauthorized callers", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /roles\.has\("admin"\)\s*\|\|\s*actor\.roles\.has\("backup_admin"\)/,
      "Must require admin or backup_admin role",
    );
    assert.match(
      body,
      /redirect\(.*notice.*["']denied["']\)/,
      "Must redirect unauthorized callers with denied notice",
    );
  });

  it("upserts into club_payment_settings with singleton id and audit metadata", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /\.from\("club_payment_settings"\)\.upsert\(/,
      "Must upsert into club_payment_settings",
    );
    assert.match(
      body,
      /id:\s*["']singleton["']/,
      "Must use singleton id for club_payment_settings",
    );
    assert.match(
      body,
      /updated_by:\s*actor\.user\.id/,
      "Must set updated_by to actor user id",
    );
  });

  it("revalidates /dues, /finances, and /admin/members on successful update", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /revalidatePath\("\/dues"\)/,
      "Must revalidate /dues path",
    );
    assert.match(
      body,
      /revalidatePath\("\/finances"\)/,
      "Must revalidate /finances path",
    );
    assert.match(
      body,
      /revalidatePath\("\/admin\/members"\)/,
      "Must revalidate /admin/members path",
    );
    assert.match(
      body,
      /payment-settings-saved/,
      "Must redirect with payment-settings-saved notice",
    );
  });
});

describe("recordOpeningBalanceAction structure and validation", () => {
  const body = extractActionBody(actionsSource, "recordOpeningBalanceAction");

  it("validates positive Naira amount and valid date", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /parseFinanceAmount/,
      "Must use parseFinanceAmount to validate positive integer amount",
    );
    assert.match(
      body,
      /parseFinanceDate/,
      "Must validate transaction_date using parseFinanceDate",
    );
    assert.match(
      body,
      /2026-10-01/,
      "Must default date to 2026-10-01 when omitted",
    );
    assert.match(
      body,
      /invalid-request/,
      "Must redirect with invalid-request on invalid amount or date",
    );
  });

  it("enforces admin or backup_admin authorization and rejects unauthorized callers", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /roles\.has\("admin"\)\s*\|\|\s*actor\.roles\.has\("backup_admin"\)/,
      "Must require admin or backup_admin role",
    );
    assert.match(
      body,
      /financeNoticeUrl\(["']denied["']\)/,
      "Must redirect unauthorized callers to finance denied notice",
    );
  });

  it("calls record_club_financial_transaction RPC with income kind and cash method", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /rpc\(\s*["']record_club_financial_transaction["']/,
      "Must invoke record_club_financial_transaction RPC",
    );
    assert.match(
      body,
      /p_kind:\s*["']income["']/,
      "Kind must be set to income",
    );
    assert.match(
      body,
      /p_payment_method:\s*["']cash["']/,
      "Payment method must be cash for opening balance",
    );
    assert.match(
      body,
      /p_idempotency_key:/,
      "Must supply idempotency key for opening balance",
    );
  });

  it("revalidates /finances and redirects to opening-balance-recorded notice", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /revalidatePath\("\/finances"\)/,
      "Must revalidate /finances path",
    );
    assert.match(
      body,
      /opening-balance-recorded/,
      "Must redirect with opening-balance-recorded notice",
    );
  });
});

describe("backfillMemberHistoricalDuesAction structure and validation", () => {
  const body = extractActionBody(
    actionsSource,
    "backfillMemberHistoricalDuesAction",
  );

  it("validates member ID against uuidPattern", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /uuidPattern\.test\(memberId\)/,
      "Must validate member_id format against uuidPattern",
    );
    assert.match(
      body,
      /invalid-request/,
      "Must redirect with invalid-request on invalid memberId",
    );
  });

  it("validates covered_months via validateBackfillMonths", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /validateBackfillMonths/,
      "Must call validateBackfillMonths to check months",
    );
    assert.match(
      body,
      /invalid-reconciliation-months/,
      "Must redirect with invalid-reconciliation-months notice when validation fails",
    );
  });

  it("enforces admin or backup_admin authorization and rejects unauthorized callers", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /roles\.has\("admin"\)\s*\|\|\s*actor\.roles\.has\("backup_admin"\)/,
      "Must require admin or backup_admin role",
    );
    assert.match(
      body,
      /duesNoticeUrl\(["']denied["']/,
      "Must redirect unauthorized callers with denied notice",
    );
  });

  it("invokes backfill_member_historical_dues RPC with normalized months", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /rpc\(\s*["']backfill_member_historical_dues["']/,
      "Must invoke backfill_member_historical_dues RPC",
    );
    assert.match(
      body,
      /p_member_id:\s*memberId/,
      "Must pass memberId as p_member_id",
    );
    assert.match(
      body,
      /p_covered_months:\s*validation\.normalizedMonths/,
      "Must pass normalized months to RPC",
    );
  });

  it("revalidates /dues and redirects with historical-dues-reconciled notice", () => {
    assert.ok(body !== null, "Action must exist");
    assert.match(
      body,
      /revalidatePath\("\/dues"\)/,
      "Must revalidate /dues path",
    );
    assert.match(
      body,
      /historical-dues-reconciled/,
      "Must redirect with historical-dues-reconciled notice",
    );
  });
});

describe("Input validation logic for server actions", () => {
  it("rejects non-10 digit bank accounts for payment settings", () => {
    assert.equal(validateNubanAccountNumber("123456789").valid, false);
    assert.equal(validateNubanAccountNumber("12345678901").valid, false);
    assert.equal(validateNubanAccountNumber("abcdefghij").valid, false);
    assert.equal(validateNubanAccountNumber("").valid, false);
    assert.equal(validateNubanAccountNumber("0123456789").valid, true);
  });

  it("validates payment settings input object correctly", () => {
    const valid = validateClubPaymentSettingsInput({
      bankName: "Zenith Bank",
      accountNumber: "0123456789",
      accountName: "Carpenters Family Social Club",
    });
    assert.equal(valid.valid, true);

    const invalid = validateClubPaymentSettingsInput({
      bankName: "Zenith Bank",
      accountNumber: "999", // not 10 digits
      accountName: "Carpenters Family Social Club",
    });
    assert.equal(invalid.valid, false);
    assert.match(invalid.error, /10 digits/i);
  });

  it("validates backfill months range (strictly 2026-02-01 to 2026-09-01)", () => {
    const valid = validateBackfillMonths(["2026-02-01", "2026-03-01"]);
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.normalizedMonths, ["2026-02-01", "2026-03-01"]);

    const janRejected = validateBackfillMonths(["2026-01-01"]);
    assert.equal(janRejected.valid, false);

    const octRejected = validateBackfillMonths(["2026-10-01"]);
    assert.equal(octRejected.valid, false);

    const emptyRejected = validateBackfillMonths([]);
    assert.equal(emptyRejected.valid, false);
  });
});
