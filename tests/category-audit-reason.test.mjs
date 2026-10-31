import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const modalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/event-category-management-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);
const actionSource = readFileSync(
  new URL(
    "../src/app/(member)/officers/event-finance-categories/actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const financeFormsSource = readFileSync(
  new URL("../src/app/(member)/finances/finance-forms.tsx", import.meta.url),
  "utf8",
);
const appActionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);

describe("Event category audit reason convention", () => {
  it("omits visible audit reason input from category creation form and provides hidden default", () => {
    assert.doesNotMatch(
      modalSource,
      /id="create-category-reason"/,
      "Category creation form must not display visible audit reason input",
    );
    assert.match(
      modalSource,
      /name="reason"[^>]*value="Initial category entry"/,
      "Category creation form must submit hidden reason 'Initial category entry'",
    );
  });

  it("retains visible required audit reason for category rename and retirement", () => {
    assert.match(
      modalSource,
      /id=\{`rename-reason-\$\{cat\.id\}`\}/,
      "Category rename form must retain visible required audit reason",
    );
    assert.match(
      modalSource,
      /id=\{`delete-reason-\$\{cat\.id\}`\}/,
      "Category retirement form must retain visible required audit reason",
    );
  });

  it("server action defaults reason to 'Initial category entry' when omitted or empty", () => {
    assert.match(
      actionSource,
      /field\(formData,\s*"reason",\s*500\)\s*\|\|\s*"Initial category entry"/,
      "createEventFinanceCategoryAction must fallback to 'Initial category entry'",
    );
  });
});

describe("Club finance category audit reason convention", () => {
  it("omits visible audit reason input from category creation form and provides hidden default", () => {
    assert.doesNotMatch(
      financeFormsSource,
      /id="cat-reason"/,
      "Club category creation form must not display visible cat-reason input",
    );
    assert.match(
      financeFormsSource,
      /name="reason"[^>]*value="Initial cost center entry"/,
      "Club category creation form must submit hidden reason 'Initial cost center entry'",
    );
  });

  it("retains visible required audit reason for category retirement, transaction correction, and transaction void", () => {
    assert.match(
      financeFormsSource,
      /id=\{`retire-reason-\$\{category\.id\}`\}/,
      "Category retirement form must retain visible required audit reason",
    );
    assert.match(
      financeFormsSource,
      /id="correct-reason"/,
      "Transaction correction form must retain visible required audit reason",
    );
    assert.match(
      financeFormsSource,
      /id="void-reason"/,
      "Transaction void form must retain visible required audit reason",
    );
  });

  it("createFinanceCategoryAction defaults reason to 'Initial cost center entry' when omitted or empty", () => {
    assert.match(
      appActionsSource,
      /formString\(formData,\s*"reason",\s*500\)\s*\|\|\s*"Initial cost center entry"/,
      "createFinanceCategoryAction must fallback to 'Initial cost center entry'",
    );
  });
});
