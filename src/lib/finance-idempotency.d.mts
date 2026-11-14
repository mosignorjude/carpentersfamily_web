export const DEFAULT_DRAFT_TTL_MS: number;

export interface ReceiptDraftMeta {
  name: string;
  size: number;
  lastModified: number;
}

export interface FinancePayloadSignatureInput {
  scope?: string;
  targetId?: string;
  kind?: string;
  amountNgn?: number | string;
  transactionDate?: string;
  description?: string | null;
  sourceNote?: string | null;
  payerPayee?: string | null;
  categoryId?: string | null;
  budgetAllocationCategoryId?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  tierId?: string | null;
  quantity?: number | string | null;
  receiptMeta?: ReceiptDraftMeta | null;
}

export function createSubmissionKey(): string;
export function normalizeFinanceText(value: unknown): string;
export function buildFinancePayloadSignature(
  input: FinancePayloadSignatureInput,
): string;
export function getSessionStorageSafe(): Storage | null;
export function rememberSubmissionDraftKey(params: {
  storage: Storage | null;
  scopeKey: string;
  signature: string;
  currentKey?: string;
  nowMs?: number;
}): string;
export function resolveDraftIdempotencyKey(params: {
  storage: Storage | null;
  scopeKey: string;
  signature?: string;
  fallbackKey?: string;
  nowMs?: number;
  ttlMs?: number;
}): string;
export function clearSubmissionDraftKey(params: {
  storage: Storage | null;
  scopeKey: string;
}): void;
export function isRetryableSubmissionError(error: unknown): boolean;
export function findProbableDuplicateTransaction<
  T extends {
    id?: string;
    type?: string;
    kind?: string;
    amount?: number | string;
    amount_ngn?: number | string;
    date?: string;
    transaction_date?: string;
    description?: string | null;
    source_note?: string | null;
    payerPayee?: string | null;
    vendorOrSource?: string | null;
    payer_payee?: string | null;
    voided?: boolean;
    voided_at?: string | null;
    status?: string;
  },
>(
  candidate: {
    kind?: string;
    type?: string;
    amountNgn?: number | string;
    amount?: number | string;
    transactionDate?: string;
    date?: string;
    transaction_date?: string;
    description?: string | null;
    sourceNote?: string | null;
    payerPayee?: string | null;
    vendorOrSource?: string | null;
    payer_payee?: string | null;
  },
  existingTransactions: T[],
): T | null;
