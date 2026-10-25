import assert from "node:assert/strict";
import { describe, it } from "node:test";

export function findOrphanKeys(s3Keys, dbKeys, cutoffDate) {
  const validDbKeys = new Set(dbKeys);
  return s3Keys
    .filter((item) => !validDbKeys.has(item.key))
    .filter((item) => new Date(item.lastModified) < cutoffDate)
    .map((item) => item.key);
}

describe("Orphan receipt sweep reconciliation", () => {
  it("identifies unreferenced S3 keys older than cutoff as orphans", () => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const s3 = [
      {
        key: "receipts/club/1/a.pdf",
        lastModified: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      },
      {
        key: "receipts/club/2/b.pdf",
        lastModified: new Date(Date.now() - 1000).toISOString(),
      },
    ];
    const db = ["receipts/club/2/b.pdf"];

    const orphans = findOrphanKeys(s3, db, cutoff);
    assert.deepEqual(orphans, ["receipts/club/1/a.pdf"]);
  });

  it("retains keys referenced by the database even if older than cutoff", () => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const s3 = [
      {
        key: "receipts/club/1/a.pdf",
        lastModified: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      },
    ];
    const db = ["receipts/club/1/a.pdf"];

    const orphans = findOrphanKeys(s3, db, cutoff);
    assert.deepEqual(orphans, []);
  });

  it("retains unreferenced keys newer than cutoff (grace period protection)", () => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const s3 = [
      {
        key: "receipts/event/temp/upload.jpg",
        lastModified: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ];
    const db = [];

    const orphans = findOrphanKeys(s3, db, cutoff);
    assert.deepEqual(orphans, []);
  });
});
