export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_RECEIPT_REQUEST_BYTES = 4_500_000;

const RECEIPT_TYPES = {
  pdf: { contentType: "application/pdf", extension: "pdf" },
  jpg: { contentType: "image/jpeg", extension: "jpg" },
  jpeg: { contentType: "image/jpeg", extension: "jpeg" },
  png: { contentType: "image/png", extension: "png" },
} as const;

export type ValidatedReceipt = {
  contentType: string;
  filename: string;
  extension: "pdf" | "jpg" | "jpeg" | "png";
};

export function validateReceiptBytes(
  originalFilename: string,
  contentType: string,
  bytes: Uint8Array,
): ValidatedReceipt | null {
  if (bytes.length < 1 || bytes.length > MAX_RECEIPT_BYTES) return null;

  const basename = originalFilename
    .normalize("NFKC")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1);
  if (!basename) return null;

  const extension = basename.split(".").at(-1)?.toLowerCase();
  if (!extension || !Object.hasOwn(RECEIPT_TYPES, extension)) return null;

  const type = RECEIPT_TYPES[extension as keyof typeof RECEIPT_TYPES];
  if (contentType !== type.contentType) return null;

  const signatureMatches =
    (extension === "pdf" &&
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d) ||
    ((extension === "jpg" || extension === "jpeg") &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (extension === "png" &&
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a);
  if (!signatureMatches) return null;

  const rawStem = basename.slice(0, basename.lastIndexOf("."));
  const safeStem = rawStem
    .replace(/[^A-Za-z0-9 _().-]/g, "_")
    .replace(/^\.+/, "")
    .replace(/[ .]+$/g, "")
    .slice(0, 114);
  const filename = `${safeStem || "receipt"}.${type.extension}`;

  return { contentType: type.contentType, filename, extension: type.extension };
}
