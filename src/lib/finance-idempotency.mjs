const DRAFT_PREFIX = "cf:finance-draft:";
export const DEFAULT_DRAFT_TTL_MS = 15 * 60 * 1000;

function fallbackUuidV4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createSubmissionKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return fallbackUuidV4();
}

export function normalizeFinanceText(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildFinancePayloadSignature(input) {
  const receipt = input.receiptMeta
    ? {
        name: normalizeFinanceText(input.receiptMeta.name),
        size: Number(input.receiptMeta.size || 0),
        lastModified: Number(input.receiptMeta.lastModified || 0),
      }
    : null;

  return JSON.stringify({
    scope: input.scope || "",
    targetId: input.targetId || "",
    kind: input.kind || "",
    amountNgn: Number(input.amountNgn || 0),
    transactionDate: String(input.transactionDate || ""),
    description: normalizeFinanceText(input.description),
    sourceNote: normalizeFinanceText(input.sourceNote),
    payerPayee: normalizeFinanceText(input.payerPayee),
    categoryId: String(input.categoryId || ""),
    budgetAllocationCategoryId: String(input.budgetAllocationCategoryId || ""),
    paymentMethod: String(input.paymentMethod || ""),
    paymentStatus: String(input.paymentStatus || ""),
    tierId: String(input.tierId || ""),
    quantity: Number(input.quantity || 0),
    receipt,
  });
}

export function getSessionStorageSafe() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredDraft(storage, scopeKey, nowMs, ttlMs) {
  if (!storage || !scopeKey) return null;
  try {
    const raw = storage.getItem(`${DRAFT_PREFIX}${scopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.idempotencyKey !== "string" ||
      typeof parsed.signature !== "string" ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (nowMs - parsed.savedAt > ttlMs) {
      storage.removeItem(`${DRAFT_PREFIX}${scopeKey}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function rememberSubmissionDraftKey({
  storage,
  scopeKey,
  signature,
  currentKey,
  nowMs = Date.now(),
}) {
  const keyToStore = currentKey || createSubmissionKey();
  if (!storage || !scopeKey || !signature) return keyToStore;
  try {
    storage.setItem(
      `${DRAFT_PREFIX}${scopeKey}`,
      JSON.stringify({
        signature,
        idempotencyKey: keyToStore,
        savedAt: nowMs,
      }),
    );
  } catch {
    // Ignore sessionStorage failures (private mode / quota limits).
  }
  return keyToStore;
}

export function resolveDraftIdempotencyKey({
  storage,
  scopeKey,
  signature,
  fallbackKey,
  nowMs = Date.now(),
  ttlMs = DEFAULT_DRAFT_TTL_MS,
}) {
  const stored = readStoredDraft(storage, scopeKey, nowMs, ttlMs);
  if (stored && (!signature || stored.signature === signature)) {
    return stored.idempotencyKey;
  }
  if (stored && signature && stored.signature !== signature) {
    return createSubmissionKey();
  }
  return fallbackKey || createSubmissionKey();
}

export function clearSubmissionDraftKey({ storage, scopeKey }) {
  if (!storage || !scopeKey) return;
  try {
    storage.removeItem(`${DRAFT_PREFIX}${scopeKey}`);
  } catch {
    // Ignore storage removal errors.
  }
}

export function isRetryableSubmissionError(error) {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  ) {
    return false;
  }
  return true;
}

function normalizeKind(kind) {
  if (kind === "revenue" || kind === "income") return "income";
  return kind || "";
}

export function findProbableDuplicateTransaction(
  candidate,
  existingTransactions,
) {
  if (!candidate || !Array.isArray(existingTransactions)) return null;
  const candidateKind = normalizeKind(candidate.kind || candidate.type);
  const candidateAmount = Number(candidate.amountNgn ?? candidate.amount ?? 0);
  const candidateDate = String(
    candidate.transactionDate ??
      candidate.date ??
      candidate.transaction_date ??
      "",
  );
  const candidateDetail = normalizeFinanceText(
    candidateKind === "income"
      ? (candidate.sourceNote ?? candidate.description)
      : (candidate.description ?? candidate.sourceNote),
  );
  const candidateParty = normalizeFinanceText(
    candidate.payerPayee ?? candidate.vendorOrSource ?? candidate.payer_payee,
  );

  for (const row of existingTransactions) {
    if (
      !row ||
      row.voided === true ||
      row.voided_at ||
      row.status === "voided" ||
      row.verificationStatus === "rejected" ||
      row.verification_status === "rejected"
    ) {
      continue;
    }
    const rowKind = normalizeKind(row.kind || row.type);
    if (candidateKind && rowKind && rowKind !== candidateKind) continue;

    const rowAmount = Number(row.amount ?? row.amount_ngn ?? 0);
    if (rowAmount !== candidateAmount) continue;

    const rowDate = String(row.date ?? row.transaction_date ?? "");
    if (rowDate !== candidateDate) continue;

    const rowDetail = normalizeFinanceText(
      rowKind === "income"
        ? (row.source_note ?? row.description)
        : (row.description ?? row.source_note),
    );
    if (rowDetail !== candidateDetail) continue;

    const rowParty = normalizeFinanceText(
      row.payerPayee ?? row.vendorOrSource ?? row.payer_payee,
    );
    if (candidateParty !== rowParty) continue;

    return row;
  }

  return null;
}
