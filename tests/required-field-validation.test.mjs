import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const authFormSource = readFileSync(
  new URL("../src/components/auth-validated-form.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);
const recordModalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/record-transaction-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);
const financeFormsSource = readFileSync(
  new URL("../src/app/(member)/finances/finance-forms.tsx", import.meta.url),
  "utf8",
);

describe("Field-specific required validation", () => {
  it("formats required field error message with the specific field label or name", () => {
    assert.match(
      authFormSource,
      /Please enter|getFieldLabel/,
      "auth-validated-form must generate 'Please enter [field name]'",
    );
    assert.doesNotMatch(
      authFormSource,
      /return "Please fill in this field\."/,
      "Must not use generic 'Please fill in this field.'",
    );
  });

  it("specifies field names or labels for sign in email and password", () => {
    assert.match(
      pageSource,
      /data-field-name="email address"/,
      "Email field must configure field name for validation feedback",
    );
    assert.match(
      pageSource,
      /data-field-name="password"/,
      "Password field must configure field name for validation feedback",
    );
  });
});

describe("RecordTransactionModal field-level validation", () => {
  it("renders FormFieldError with AlertCircle under amount, description, and counterparty fields", () => {
    assert.match(
      recordModalSource,
      /FormFieldError/,
      "Must import and render FormFieldError in RecordTransactionModal",
    );
    assert.match(
      recordModalSource,
      /Please enter amount/,
      "Must provide 'Please enter amount' error message",
    );
    assert.match(
      recordModalSource,
      /Please enter transaction description/,
      "Must provide 'Please enter transaction description' error message",
    );
  });
});

describe("Club Finance Forms field-level validation", () => {
  it("renders FormFieldError in ClubIncomeForm and ClubExpenseForm", () => {
    assert.match(
      financeFormsSource,
      /FormFieldError/,
      "Must import and render FormFieldError in finance-forms.tsx",
    );
    assert.match(
      financeFormsSource,
      /Please enter amount/,
      "Must provide 'Please enter amount' in finance forms",
    );
    assert.match(
      financeFormsSource,
      /Please enter source note/,
      "Must provide 'Please enter source note' in income form",
    );
    assert.match(
      financeFormsSource,
      /Please enter expense description/,
      "Must provide 'Please enter expense description' in expense form",
    );
  });
});
