import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const duesForms = readFileSync(
  new URL("../src/app/(member)/dues/dues-forms.tsx", import.meta.url),
  "utf8"
);
const duesPageView = readFileSync(
  new URL("../src/components/dues/dues-page-view.tsx", import.meta.url),
  "utf8"
);
const approvalsCard = readFileSync(
  new URL(
    "../src/components/dues/officer-dues-approvals-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const controlsCard = readFileSync(
  new URL(
    "../src/components/dues/officer-dues-controls-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const scheduleCard = readFileSync(
  new URL("../src/components/dues/dues-schedule-card.tsx", import.meta.url),
  "utf8"
);
const paymentsCard = readFileSync(
  new URL(
    "../src/components/dues/dues-payments-history-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const ratesCard = readFileSync(
  new URL(
    "../src/components/dues/dues-rate-schedule-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const auditCard = readFileSync(
  new URL(
    "../src/components/dues/dues-audit-history-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const reconciliationCard = readFileSync(
  new URL(
    "../src/components/dues/pre-launch-dues-reconciliation-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const payModal = readFileSync(
  new URL("../src/components/dues/pay-dues-modal.tsx", import.meta.url),
  "utf8"
);

describe("Mobile Dues Form Alignment & Width Unification", () => {
  it("flattens nested form containers in dues-forms.tsx to eliminate squeezed form widths", () => {
    // DuesPaymentForm must not contain nested p-5 rounded-xl border
    assert.doesNotMatch(
      duesForms,
      /<form[\s\S]*?className="[^"]*p-5\s+rounded-xl\s+border[^"]*"[^>]*encType="multipart\/form-data"/,
      "DuesPaymentForm must not have redundant nested card padding and border"
    );

    // DuesWriteOffForm must not contain nested p-5 rounded-xl border
    assert.doesNotMatch(
      duesForms,
      /action=\{writeOffDuesAction\}[\s\S]*?className="[^"]*p-5\s+rounded-xl\s+border/,
      "DuesWriteOffForm must not have redundant nested card padding and border"
    );

    // DuesRateForm must not contain nested p-4 rounded-xl border
    assert.doesNotMatch(
      duesForms,
      /action=\{setDuesRateAction\}[\s\S]*?className="[^"]*p-4\s+rounded-xl\s+border/,
      "DuesRateForm must not have redundant nested card padding and border"
    );
  });

  it("enforces w-full sm:w-auto and min-h-[44px] on all dues form submit buttons", () => {
    // DuesPaymentForm submit button
    assert.match(
      duesForms,
      /className="[^"]*w-full\s+sm:w-auto[^"]*min-h-\[44px\][^"]*"[\s\S]*?type="submit"[\s\S]*?Record Dues Payment/,
      "DuesPaymentForm submit button must be w-full on mobile with 44px min-height"
    );

    // DuesWriteOffForm submit button
    assert.match(
      duesForms,
      /className="[^"]*w-full\s+sm:w-auto[^"]*min-h-\[44px\][^"]*"[\s\S]*?type="submit"[\s\S]*?Confirm Statutory Write-Off/,
      "DuesWriteOffForm submit button must be w-full on mobile with 44px min-height"
    );

    // DuesPaymentCorrectionForm submit button
    assert.match(
      duesForms,
      /className="[^"]*w-full\s+sm:w-auto[^"]*min-h-\[44px\][^"]*"[\s\S]*?type="submit"[\s\S]*?Save Payment Correction/,
      "DuesPaymentCorrectionForm submit button must be w-full on mobile with 44px min-height"
    );

    // DuesRateForm submit button
    assert.match(
      duesForms,
      /className="[^"]*w-full\s+sm:w-auto[^"]*min-h-\[44px\][^"]*"[\s\S]*?type="submit"[\s\S]*?Schedule Dues Rate/,
      "DuesRateForm submit button must be w-full on mobile with 44px min-height"
    );

    // Member Switcher submit button in dues-page-view.tsx
    assert.match(
      duesPageView,
      /className="[^"]*w-full\s+sm:w-auto[^"]*min-h-\[44px\][^"]*"[\s\S]*?type="submit"[\s\S]*?Load Ledger/,
      "Member Switcher submit button must be w-full on mobile with 44px min-height"
    );
  });

  it("ensures symmetrical action button widths in OfficerDuesApprovalsCard", () => {
    // Approve form must be w-full sm:w-auto
    assert.match(
      approvalsCard,
      /action=\{approveDuesPaymentRequestAction\}[\s\S]*?className="w-full sm:w-auto"/,
      "Approve dues form must stretch with w-full sm:w-auto on mobile"
    );

    // Both Reject and Approve buttons must have w-full sm:w-auto and min-h-[44px]
    assert.match(
      approvalsCard,
      /Reject Submission[\s\S]*?w-full sm:w-auto|w-full sm:w-auto[\s\S]*?Reject Submission/,
      "Reject button must have w-full sm:w-auto"
    );
    assert.match(
      approvalsCard,
      /btn-approve-dues-action[\s\S]*?w-full sm:w-auto/,
      "Approve button must have w-full sm:w-auto"
    );
  });

  it("normalizes card containers on dues page to rounded-2xl and consistent mobile padding", () => {
    assert.match(controlsCard, /rounded-2xl/);
    assert.match(scheduleCard, /rounded-2xl/);
    assert.match(paymentsCard, /rounded-2xl/);
    assert.match(ratesCard, /rounded-2xl/);
    assert.match(auditCard, /rounded-2xl/);
  });

  it("remedies cash helper vertical gap and pay dues modal footer layout", () => {
    // Cash helper text must use responsive padding pt-1 sm:pt-6
    assert.match(
      duesForms,
      /className="[^"]*pt-1\s+sm:pt-6[^"]*"/,
      "Cash transaction helper must use responsive pt-1 sm:pt-6"
    );

    // PayDuesModal footer must support mobile stacking
    assert.match(
      payModal,
      /flex-col-reverse\s+sm:flex-row/,
      "Pay dues modal footer must stack buttons on mobile"
    );
  });
});
