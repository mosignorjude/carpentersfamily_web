import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveR2Config } from "../src/lib/r2/config.mjs";

const complete = {
  R2_ACCOUNT_ID: "abc123",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "club-receipts",
};

describe("R2 configuration", () => {
  it("returns null until every required value is present", () => {
    assert.equal(resolveR2Config({}), null);
    for (const key of Object.keys(complete)) {
      const partial = { ...complete };
      delete partial[key];
      assert.equal(resolveR2Config(partial), null);
    }
  });

  it("derives the account endpoint", () => {
    assert.deepEqual(resolveR2Config(complete), {
      accountId: "abc123",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketName: "club-receipts",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
    });
  });

  it("honours a valid https override and rejects non-https endpoints", () => {
    assert.equal(
      resolveR2Config({ ...complete, R2_ENDPOINT: "https://r2.example.test" })
        ?.endpoint,
      "https://r2.example.test",
    );
    assert.equal(
      resolveR2Config({ ...complete, R2_ENDPOINT: "http://r2.example.test" }),
      null,
    );
  });
});
