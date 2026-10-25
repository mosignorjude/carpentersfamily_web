export type ReceiptScope = "club" | "event" | "event_ticket" | "dues";

export interface ReceiptCommitPayload {
  receiptId: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ReceiptEntryInput {
  scope: ReceiptScope;
  targetId: string;
  paymentMethod: string;
  paymentStatus?: string;
  hasReceipt?: boolean;
  allowLegacyMethod?: boolean;
  file?: File | null;
}

export interface ReceiptEntryDeps {
  storage: {
    putObject: (
      key: string,
      body: Uint8Array,
      contentType: string,
    ) => Promise<unknown>;
    deleteObject: (key: string) => Promise<unknown>;
  } | null;
  validateReceipt: (
    filename: string,
    contentType: string,
    bytes: Uint8Array,
  ) => { filename: string; contentType: string } | null;
  newId?: () => string;
}

export type ReceiptCommitResult =
  | { kind: "ok"; id: string; deduplicated?: boolean }
  | {
      kind: "error";
      error?: {
        message?: string | null;
        code?: string | null;
        details?: string | null;
        hint?: string | null;
      } | null;
    };

export type ReceiptEntryResult =
  | { kind: "ok"; id: string; deduplicated: boolean }
  | {
      kind: "error";
      notice: string;
      error?: {
        message?: string | null;
        code?: string | null;
        details?: string | null;
        hint?: string | null;
      } | null;
    };

export function runReceiptEntry(
  input: ReceiptEntryInput,
  deps: ReceiptEntryDeps,
  commit: (
    receipt: ReceiptCommitPayload | null,
  ) => Promise<ReceiptCommitResult>,
): Promise<ReceiptEntryResult>;
