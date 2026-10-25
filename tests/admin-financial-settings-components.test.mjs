import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const bankCardPath = new URL(
  "../src/components/admin/club-bank-settings-card.tsx",
  import.meta.url,
);
const openingBalanceCardPath = new URL(
  "../src/components/finances/opening-balance-entry-card.tsx",
  import.meta.url,
);
const financesPagePath = new URL(
  "../src/app/(member)/finances/page.tsx",
  import.meta.url,
);
const financesViewPath = new URL(
  "../src/components/finances/finances-page-view.tsx",
  import.meta.url,
);
const csvScriptPath = new URL(
  "../scripts/app-records-csv.mjs",
  import.meta.url,
);

describe("ClubBankSettingsCard component requirements", () => {
  it("file exists at src/components/admin/club-bank-settings-card.tsx", () => {
    assert.ok(
      existsSync(bankCardPath),
      "src/components/admin/club-bank-settings-card.tsx must exist",
    );
  });

  it("submits to updateClubPaymentSettingsAction with hidden return_to input", () => {
    const source = readFileSync(bankCardPath, "utf8");
    assert.match(
      source,
      /updateClubPaymentSettingsAction/,
      "Form must submit to updateClubPaymentSettingsAction",
    );
    assert.match(
      source,
      /<input[^>]*name=["']return_to["'][^>]*value=["']\/finances["']|<input[^>]*value=["']\/finances["'][^>]*name=["']return_to["']/,
      "Must include hidden input return_to set to /finances",
    );
  });

  it("defines fields for bank_name, account_number, account_name, instructions", () => {
    const source = readFileSync(bankCardPath, "utf8");
    assert.match(source, /name=["']bank_name["']/);
    assert.match(source, /name=["']account_number["']/);
    assert.match(source, /name=["']account_name["']/);
    assert.match(source, /name=["']instructions["']/);
  });

  it("enforces 10-digit NUBAN account number pattern and max length", () => {
    const source = readFileSync(bankCardPath, "utf8");
    assert.match(
      source,
      /pattern=["']\^?\[0-9\]\{10\}\$?["']/,
      "account_number input must enforce 10 digits pattern",
    );
    assert.match(
      source,
      /maxLength=\{?10\}?/,
      "account_number input must enforce maxLength of 10",
    );
  });

  it("renders read-only presentation card without edit fields when isAdmin is false", () => {
    const source = readFileSync(bankCardPath, "utf8");
    assert.match(
      source,
      /if\s*\(\s*!(?:canEdit|isAdmin)/,
      "Must check !canEdit / !isAdmin to branch into read-only mode",
    );
    assert.match(
      source,
      /Read Only|Restricted|Settlement account updates are restricted/i,
      "Read-only mode must display administrative notice",
    );
  });

  it("uses Warm Editorial palette styling tokens", () => {
    const source = readFileSync(bankCardPath, "utf8");
    assert.match(source, /#174C37/, "Must include forest green #174C37");
    assert.match(source, /#FAF6F0/, "Must include warm canvas #FAF6F0");
    assert.match(source, /#3D291F/, "Must include bronze text #3D291F");
    assert.match(source, /#D6A23A/, "Must include gold accent #D6A23A");
  });
});

describe("OpeningBalanceEntryCard component requirements", () => {
  it("file exists at src/components/finances/opening-balance-entry-card.tsx", () => {
    assert.ok(
      existsSync(openingBalanceCardPath),
      "src/components/finances/opening-balance-entry-card.tsx must exist",
    );
  });

  it("submits to recordOpeningBalanceAction with amount_ngn, transaction_date, source_note", () => {
    const source = readFileSync(openingBalanceCardPath, "utf8");
    assert.match(
      source,
      /recordOpeningBalanceAction/,
      "Form must submit to recordOpeningBalanceAction",
    );
    assert.match(source, /name=["']amount_ngn["']/);
    assert.match(source, /name=["']transaction_date["']/);
    assert.match(source, /name=["']source_note["']/);
  });

  it("defaults transaction_date to 2026-10-01 and source_note to go-live statement", () => {
    const source = readFileSync(openingBalanceCardPath, "utf8");
    assert.match(
      source,
      /defaultValue=["']2026-10-01["']/,
      "transaction_date must default to 2026-10-01",
    );
    assert.match(
      source,
      /defaultValue=["']Verified pre-launch opening treasury balance as of go-live["']/,
      "source_note must default to verified statement",
    );
  });

  it("includes informational disclaimer regarding starting reserve and Feb-Sep 2026 historical dues", () => {
    const source = readFileSync(openingBalanceCardPath, "utf8");
    assert.match(
      source,
      /Historical dues collected from Feb[–-]Sep\s+2026 are included in this balance and will not be double-counted/i,
      "Must include standard pre-launch disclaimer text",
    );
  });

  it("renders verified and locked badge when existingOpeningBalance is present", () => {
    const source = readFileSync(openingBalanceCardPath, "utf8");
    assert.match(
      source,
      /Opening Reserve Verified & Locked|Opening Reserve Verified/i,
      "Must render verified & locked badge when existingOpeningBalance is provided",
    );
    assert.match(
      source,
      /formatNaira/,
      "Must format opening reserve amount using formatNaira",
    );
  });

  it("prevents duplicate entry by omitting or disabling form inputs when existingOpeningBalance is present", () => {
    const source = readFileSync(openingBalanceCardPath, "utf8");
    assert.match(
      source,
      /if\s*\(\s*existingOpeningBalance\s*\)/,
      "Must guard with early return or condition for existingOpeningBalance",
    );
  });
});

describe("Page and View Wiring verification", () => {
  it("src/app/(member)/finances/page.tsx queries club_payment_settings and existing opening balance", () => {
    const source = readFileSync(financesPagePath, "utf8");
    assert.match(
      source,
      /\.from\(["']club_payment_settings["']\)/,
      "finances/page.tsx must query club_payment_settings",
    );
    assert.match(
      source,
      /\.from\(["']club_financial_transactions["']\)[\s\S]*?opening%treasury%balance/,
      "finances/page.tsx must query opening treasury balance transaction",
    );
    assert.match(
      source,
      /roles\.has\(["']admin["']\)\s*\|\|\s*roles\.has\(["']backup_admin["']\)|roles\.includes\(["']admin["']\)\s*\|\|\s*roles\.includes\(["']backup_admin["']\)/,
      "finances/page.tsx must evaluate isAdmin based on admin or backup_admin roles",
    );
    assert.match(
      source,
      /<FinancesPageView[\s\S]*?\/>/,
      "FinancesPageView must be rendered",
    );
    assert.match(
      source,
      /paymentSettings=\{paymentSettings\}/,
      "FinancesPageView must receive paymentSettings",
    );
    assert.match(
      source,
      /existingOpeningBalance=\{existingOpeningBalance\}/,
      "FinancesPageView must receive existingOpeningBalance",
    );
    assert.match(
      source,
      /isAdmin=\{isAdmin\}/,
      "FinancesPageView must receive isAdmin",
    );
  });

  it("src/components/finances/finances-page-view.tsx renders ClubBankSettingsCard and OpeningBalanceEntryCard", () => {
    const source = readFileSync(financesViewPath, "utf8");
    assert.match(
      source,
      /ClubBankSettingsCard/,
      "finances-page-view.tsx must import and render ClubBankSettingsCard",
    );
    assert.match(
      source,
      /OpeningBalanceEntryCard/,
      "finances-page-view.tsx must import and render OpeningBalanceEntryCard",
    );
  });
});

describe("app-records-csv table allowlist", () => {
  it("includes public.club_payment_settings in APP_RECORDS_TABLES", () => {
    const source = readFileSync(csvScriptPath, "utf8");
    assert.match(
      source,
      /\[\s*["']public["']\s*,\s*["']club_payment_settings["']\s*\]/,
      "APP_RECORDS_TABLES must include public.club_payment_settings",
    );
  });
});
