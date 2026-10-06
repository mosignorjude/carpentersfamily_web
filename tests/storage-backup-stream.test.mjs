import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import {
  assertLoopbackSupabaseUrl,
  readTarEntries,
  validateArchiveManifest,
  validateReceiptBytes,
  validateReceiptObject,
  writeStorageTar,
} from "../scripts/storage-backup.mjs";

const transactionId = "10000000-0000-0000-0000-000000000001";
const receiptId = "20000000-0000-0000-0000-000000000001";
const pdf = Buffer.from("%PDF-1.7\nreceipt", "ascii");
const sha256 = createHash("sha256").update(pdf).digest("hex");

function record(overrides = {}) {
  return {
    bucket_id: "club-finance-receipts",
    name: transactionId + "/" + receiptId + ".pdf",
    receipt_kind: "club",
    receipt_id: receiptId,
    transaction_id: transactionId,
    content_type: "application/pdf",
    size_bytes: pdf.length,
    storage_size_bytes: pdf.length,
    storage_content_type: "application/pdf",
    sha256,
    status: "available",
    cache_control: "max-age=3600",
    ...overrides,
  };
}

function manifest() {
  const object = validateReceiptObject(record());
  return {
    format: "cfsc-storage-backup-v1",
    projectRef: "kgihmudjdvwrvteclodl",
    createdAtUtc: "2026-10-06T00:00:00.000Z",
    bucketIds: ["club-finance-receipts"],
    objectCount: 1,
    totalBytes: pdf.length,
    objects: [{
      archiveEntry: "objects/00000001",
      bucketId: object.bucketId,
      path: object.path,
      receiptKind: object.receiptKind,
      receiptId: object.receiptId,
      transactionId: object.transactionId,
      contentType: object.contentType,
      sizeBytes: object.sizeBytes,
      sha256: object.sha256,
      cacheControl: object.cacheControl,
    }],
    storageReadRole: "admin",
  };
}

async function createTar(manifestObject, objectBytes = pdf) {
  const chunks = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await writeStorageTar(
    sink,
    manifestObject,
    [{ name: "objects/00000001", bytes: objectBytes }],
  );
  sink.end();
  return Buffer.concat(chunks);
}

test("receipt backup metadata accepts only an available object with matching path, type, size, and hash", () => {
  const normalized = validateReceiptObject(record());
  assert.equal(normalized.bucketId, "club-finance-receipts");
  assert.equal(normalized.sizeBytes, pdf.length);
  assert.equal(normalized.cacheControl, "3600");
  validateReceiptBytes(normalized, pdf);
});

test("receipt backup rejects orphan, pending, unsupported, tampered, and oversized records", () => {
  assert.throws(() => validateReceiptObject(record({ receipt_kind: null })), /not attached/);
  assert.throws(() => validateReceiptObject(record({ status: "pending" })), /not attached/);
  assert.throws(() => validateReceiptObject(record({ bucket_id: "other-bucket" })), /Unsupported/);
  assert.throws(() => validateReceiptObject(record({ name: "../unsafe.pdf" })), /path is invalid/);
  assert.throws(() => validateReceiptObject(record({ storage_size_bytes: pdf.length + 1 })), /size does not match/);
  assert.throws(() => validateReceiptObject(record({ storage_content_type: "image/png" })), /content type does not match/);
  assert.throws(() => validateReceiptObject(record({ size_bytes: 4_194_305, storage_size_bytes: 4_194_305 })), /size does not match/);
  assert.throws(() => validateReceiptBytes(validateReceiptObject(record()), Buffer.from("tampered")), /byte length/);
});

test("encrypted archive tar framing round-trips through bounded in-memory streams", async () => {
  const tar = await createTar(manifest());
  const fragments = [];
  for (let offset = 0; offset < tar.length; offset += 37) {
    fragments.push(tar.subarray(offset, offset + 37));
  }
  const entries = [];
  for await (const entry of readTarEntries(Readable.from(fragments))) entries.push(entry);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "manifest.json");
  assert.deepEqual(JSON.parse(entries[0].content.toString("utf8")), manifest());
  assert.equal(entries[1].name, "objects/00000001");
  assert.deepEqual(entries[1].content, pdf);
});

test("archive rejects a mismatched object digest before it can be encrypted", async () => {
  await assert.rejects(
    createTar(manifest(), Buffer.from("%PDF-1.7\nnotreal", "ascii")),
    /SHA-256/,
  );
});

test("archive manifest rejects duplicate paths and impossible totals", () => {
  const value = manifest();
  value.objects.push({ ...value.objects[0], archiveEntry: "objects/00000002" });
  value.objectCount = 2;
  value.totalBytes *= 2;
  assert.throws(() => validateArchiveManifest(value), /repeats a Storage object/);
});

test("restore target permits only the local Supabase API endpoint", () => {
  assert.equal(assertLoopbackSupabaseUrl("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
  assert.equal(assertLoopbackSupabaseUrl("http://localhost:54321/"), "http://localhost:54321");
  assert.throws(() => assertLoopbackSupabaseUrl("https://example.supabase.co"), /only the local/);
  assert.throws(() => assertLoopbackSupabaseUrl("http://127.0.0.1:54322"), /only the local/);
  assert.throws(() => assertLoopbackSupabaseUrl("http://user:pass@127.0.0.1:54321"), /only the local/);
});
