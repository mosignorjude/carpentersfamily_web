import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/enqueue-retry.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const retry = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

describe("notification enqueue retry", () => {
  it("retries a transient failure and returns the idempotent enqueue result", async () => {
    let attempts = 0;
    const delays = [];

    const result = await retry.withNotificationEnqueueRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("upstream unavailable"), {
            status: 503,
          });
        }
        return "outbox-id-1";
      },
      {
        operation: "email",
        idempotencyKey: "email:stable-key",
        delay: async (ms) => delays.push(ms),
      },
    );

    assert.equal(result, "outbox-id-1");
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [100]);
  });

  it("surfaces a transient failure after the bounded retry budget", async () => {
    let attempts = 0;
    const delays = [];

    await assert.rejects(
      retry.withNotificationEnqueueRetry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("connection reset"), { status: 503 });
        },
        {
          operation: "broadcast",
          idempotencyKey: "broadcast:stable-key",
          delay: async (ms) => delays.push(ms),
        },
      ),
      (error) => {
        assert.equal(error.name, "NotificationEnqueueError");
        assert.match(error.message, /broadcast/);
        assert.match(error.message, /broadcast:stable-key/);
        assert.match(error.message, /3 attempts/);
        return true;
      },
    );

    assert.equal(attempts, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  it("does not retry a permanent authorization failure", async () => {
    let attempts = 0;

    await assert.rejects(
      retry.withNotificationEnqueueRetry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("permission denied"), {
            code: "42501",
          });
        },
        {
          operation: "email",
          idempotencyKey: "email:stable-key",
          delay: async () => assert.fail("permanent errors must not retry"),
        },
      ),
      { name: "NotificationEnqueueError" },
    );

    assert.equal(attempts, 1);
  });
});
