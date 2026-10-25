import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatClubBankPresentation } from "../src/lib/pre-launch-reconciliation.mjs";

const payDuesModalSource = readFileSync(
  new URL("../src/components/dues/pay-dues-modal.tsx", import.meta.url),
  "utf8",
);
const duesPageViewSource = readFileSync(
  new URL("../src/components/dues/dues-page-view.tsx", import.meta.url),
  "utf8",
);
const duesPageSource = readFileSync(
  new URL("../src/app/(member)/dues/page.tsx", import.meta.url),
  "utf8",
);

describe("formatClubBankPresentation helper logic", () => {
  it("formats configured bank details with name, account number, account name and instructions", () => {
    const settings = {
      bankName: "Zenith Bank",
      accountNumber: "1029384756",
      accountName: "Carpenters Family Social Club",
      instructions: "Include member full name in transfer description.",
    };

    const presentation = formatClubBankPresentation(settings);

    assert.equal(presentation.isConfigured, true);
    assert.equal(presentation.bankName, "Zenith Bank");
    assert.equal(presentation.accountNumber, "1029384756");
    assert.equal(presentation.accountName, "Carpenters Family Social Club");
    assert.equal(
      presentation.displayBankTitle,
      "Zenith Bank · Carpenters Family Social Club",
    );
    assert.equal(presentation.displayAccountNumber, "1029384756");
    assert.equal(presentation.copyDisabled, false);
    assert.equal(
      presentation.instructions,
      "Include member full name in transfer description.",
    );
  });

  it("handles null or undefined settings with verification pending status and disabled copy", () => {
    for (const nullish of [null, undefined, {}]) {
      const presentation = formatClubBankPresentation(nullish);

      assert.equal(presentation.isConfigured, false);
      assert.equal(
        presentation.displayBankTitle,
        "Club bank details verification pending",
      );
      assert.equal(presentation.displayAccountNumber, "Pending verification");
      assert.equal(presentation.copyDisabled, true);
      assert.match(presentation.pendingNotice, /verif/i);
    }
  });

  it("handles optional instructions gracefully when omitted", () => {
    const settings = {
      bankName: "Access Bank",
      accountNumber: "0123456789",
      accountName: "Carpenters Social Club",
    };

    const presentation = formatClubBankPresentation(settings);
    assert.equal(presentation.isConfigured, true);
    assert.equal(presentation.instructions, undefined);
  });
});

describe("PayDuesModal source code dynamic binding verification", () => {
  it("does not contain hardcoded dummy bank account details", () => {
    assert.doesNotMatch(
      payDuesModalSource,
      /const accountNumber\s*=\s*["']1234567890["']/,
      "Must not contain hardcoded accountNumber '1234567890'",
    );
    assert.doesNotMatch(
      payDuesModalSource,
      /const bankName\s*=\s*["']Nigerian Bank["']/,
      "Must not contain hardcoded bankName 'Nigerian Bank'",
    );
  });

  it("defines paymentSettings prop in PayDuesModalProps", () => {
    assert.match(
      payDuesModalSource,
      /paymentSettings\??\s*:\s*\{[\s\S]*?bankName:\s*string;[\s\S]*?accountNumber:\s*string;[\s\S]*?accountName:\s*string;[\s\S]*?\}\s*\|\s*null/,
      "PayDuesModalProps must accept paymentSettings",
    );
  });

  it("destructures paymentSettings in PayDuesModal function signature", () => {
    assert.match(
      payDuesModalSource,
      /export function PayDuesModal\(\{[\s\S]*?paymentSettings[\s\S]*?\}: PayDuesModalProps\)/,
      "PayDuesModal signature must destructure paymentSettings",
    );
  });

  it("binds handleCopy to the dynamic account number and guards against missing details", () => {
    assert.match(
      payDuesModalSource,
      /navigator\.clipboard[\s\S]*?\.writeText\(/,
      "Must call navigator.clipboard.writeText",
    );
    assert.doesNotMatch(
      payDuesModalSource,
      /writeText\(["']1234567890["']\)/,
      "Must not copy hardcoded dummy account number",
    );
  });

  it("renders pending fallback text when bank details are unconfigured", () => {
    assert.match(
      payDuesModalSource,
      /Club bank details verification pending/,
      "Must display verification pending fallback title",
    );
    assert.match(
      payDuesModalSource,
      /Pending verification/,
      "Must display Pending verification in account number slot",
    );
  });

  it("disables copy button when paymentSettings is not configured", () => {
    assert.match(
      payDuesModalSource,
      /disabled=\{[a-zA-Z0-9_.]*(?:copyDisabled|!paymentSettings|!isBankConfigured)\}/,
      "Copy button must be disabled when settings are missing",
    );
  });
});

describe("DuesPageView and page.tsx wiring verification", () => {
  it("DuesPageView accepts paymentSettings prop and passes it to PayDuesModal", () => {
    assert.match(
      duesPageViewSource,
      /paymentSettings\??\s*:/,
      "DuesPageViewProps must define paymentSettings prop",
    );
    assert.match(
      duesPageViewSource,
      /<PayDuesModal[\s\S]*?paymentSettings=\{paymentSettings\}[\s\S]*?\/>/,
      "DuesPageView must pass paymentSettings to PayDuesModal",
    );
  });

  it("src/app/(member)/dues/page.tsx queries club_payment_settings singleton", () => {
    assert.match(
      duesPageSource,
      /\.from\(["']club_payment_settings["']\)/,
      "Must query club_payment_settings table",
    );
    assert.match(
      duesPageSource,
      /\.eq\(["']id["'],\s*["']singleton["']\)/,
      "Must query singleton row",
    );
    assert.match(
      duesPageSource,
      /\.select\(["'][^"']*bank_name[^"']*account_number[^"']*account_name[^"']*["']\)/,
      "Must select bank_name, account_number, account_name",
    );
  });

  it("src/app/(member)/dues/page.tsx passes paymentSettings into DuesPageView", () => {
    assert.match(
      duesPageSource,
      /<DuesPageView[\s\S]*?paymentSettings=\{paymentSettings\}[\s\S]*?\/>/,
      "DuesPage must pass paymentSettings to DuesPageView",
    );
  });
});
