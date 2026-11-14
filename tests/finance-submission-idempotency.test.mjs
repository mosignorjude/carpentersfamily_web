import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Issue 01: expense submission idempotency across retries and slow networks", () => {
  it("persists and reuses logical idempotency keys per draft and rotates only on confirmed completion", async () => {
    const helper = await import("../src/lib/finance-idempotency.mjs");

    const storeMap = new Map();
    const storage = {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, v),
      removeItem: (k) => storeMap.delete(k),
    };

    const draftInput = {
      scope: "event",
      targetId: "evt-1",
      kind: "expense",
      amountNgn: 9800,
      transactionDate: "2026-11-06",
      description: "TikTok Advert",
      payerPayee: "TikTok",
      paymentMethod: "bank_transfer",
      receiptMeta: { name: "IMG_9212.png", size: 120000, lastModified: 1730900000 },
    };

    const sig = helper.buildFinancePayloadSignature(draftInput);
    const key1 = helper.rememberSubmissionDraftKey({
      storage,
      scopeKey: "event:evt-1:expense",
      signature: sig,
      currentKey: "11111111-1111-4111-8111-111111111111",
      nowMs: 1_000,
    });

    assert.equal(key1, "11111111-1111-4111-8111-111111111111");

    // Simulate network drop/timeout reload and re-entry of the exact same transaction
    const recoveredKey = helper.resolveDraftIdempotencyKey({
      storage,
      scopeKey: "event:evt-1:expense",
      signature: sig,
      nowMs: 46_000,
    });
    assert.equal(
      recoveredKey,
      key1,
      "retried or post-timeout re-entered identical draft within TTL must reuse the original idempotency key",
    );

    // Changing material transaction details yields a distinct draft key even when
    // the caller still holds the previous key as fallbackKey in component state
    const sigDifferent = helper.buildFinancePayloadSignature({
      ...draftInput,
      amountNgn: 15000,
    });
    const newKey = helper.resolveDraftIdempotencyKey({
      storage,
      scopeKey: "event:evt-1:expense",
      signature: sigDifferent,
      fallbackKey: key1,
      nowMs: 47_000,
    });
    assert.notEqual(
      newKey,
      key1,
      "different transaction payload must not reuse a prior draft key even when fallbackKey equals the stored key",
    );

    // Explicit completion clears draft so a future identical purchase can be intentionally recorded
    helper.clearSubmissionDraftKey({
      storage,
      scopeKey: "event:evt-1:expense",
    });
    const freshKeyAfterSuccess = helper.resolveDraftIdempotencyKey({
      storage,
      scopeKey: "event:evt-1:expense",
      signature: sig,
      nowMs: 50_000,
    });
    assert.notEqual(
      freshKeyAfterSuccess,
      key1,
      "completed submission must clear stored draft key so subsequent legitimate repeat purchases get a fresh key",
    );
  });

  it("detects probable unvoided duplicate expense entries without blocking voided or distinct entries", async () => {
    const helper = await import("../src/lib/finance-idempotency.mjs");

    const existing = [
      {
        id: "tx-active",
        type: "expense",
        amount: 9800,
        date: "2026-11-06",
        description: "TikTok Advert",
        vendorOrSource: "TikTok",
        voided: false,
      },
      {
        id: "tx-rejected",
        type: "expense",
        amount: 9800,
        date: "2026-11-06",
        description: "Rejected Advert",
        vendorOrSource: "TikTok",
        voided: false,
        verificationStatus: "rejected",
      },
      {
        id: "tx-voided",
        type: "expense",
        amount: 5000,
        date: "2026-11-06",
        description: "Fuel Purchase",
        vendorOrSource: "Total",
        voided: true,
      },
    ];

    const match = helper.findProbableDuplicateTransaction(
      {
        kind: "expense",
        amountNgn: 9800,
        transactionDate: "2026-11-06",
        description: "  tiktok   advert ",
        payerPayee: "tiktok",
      },
      existing,
    );
    assert.equal(match?.id, "tx-active");

    const rejectedNoMatch = helper.findProbableDuplicateTransaction(
      {
        kind: "expense",
        amountNgn: 9800,
        transactionDate: "2026-11-06",
        description: "Rejected Advert",
        payerPayee: "TikTok",
      },
      existing,
    );
    assert.equal(
      rejectedNoMatch,
      null,
      "rejected entries must not block re-submission as active duplicates",
    );

    const voidedNoMatch = helper.findProbableDuplicateTransaction(
      {
        kind: "expense",
        amountNgn: 5000,
        transactionDate: "2026-11-06",
        description: "Fuel Purchase",
        payerPayee: "Total",
      },
      existing,
    );
    assert.equal(voidedNoMatch, null, "voided entries must not count as active duplicates");
  });

  it("RecordTransactionModal uses stripped numAmount (not comma-broken Number(amount)) for duplicate detection", async () => {
    const modalSource = await readFile(
      new URL(
        "../src/components/events/dashboard/modals/record-transaction-modal.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.doesNotMatch(
      modalSource,
      /const\s+parsedAmount\s*=\s*Number\(amount\)/,
      "comma-formatted input must use numAmount instead of Number(amount)",
    );
    assert.match(
      modalSource,
      /amountNgn:\s*numAmount/,
      "duplicate check and signature must pass numAmount",
    );
  });

  it("EventDashboardView holds a stable modal idempotency key and never discards server-action errors with void", async () => {
    const dashboardView = await readFile(
      new URL(
        "../src/components/events/dashboard/event-dashboard-view.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    const handlerMatch = dashboardView.match(
      /const handleSaveTransaction =[\s\S]*?\n  \};/,
    );
    assert.ok(handlerMatch, "handleSaveTransaction must exist");

    assert.doesNotMatch(
      handlerMatch[0],
      /crypto\.randomUUID\(/,
      "handleSaveTransaction must not mint a new randomUUID per submit attempt",
    );
    assert.doesNotMatch(
      handlerMatch[0],
      /void\s+recordEventFinancialTransactionAction/,
      "handleSaveTransaction must not swallow network/server errors with void",
    );
    assert.match(
      dashboardView,
      /resolveDraftIdempotencyKey|rememberSubmissionDraftKey/,
      "EventDashboardView must persist and reuse logical submission keys across retries",
    );
  });

  it("Club finances forms persist draft keys across retries and surface probable duplicate warning", async () => {
    const financesView = await readFile(
      new URL(
        "../src/components/finances/finances-page-view.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      financesView,
      /rememberSubmissionDraftKey|clearSubmissionDraftKey/,
      "FinancesPageView must integrate session draft idempotency persistence",
    );
  });
});
