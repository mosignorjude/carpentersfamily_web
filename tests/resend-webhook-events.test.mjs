import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/resend-webhook-events.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { isOutboxSyncEvent } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

describe("Resend webhook outbox sync events", () => {
  it("mirrors every delivery state the outbox RPC accepts", () => {
    for (const eventType of [
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.bounced",
      "email.complained",
      "email.failed",
    ]) {
      assert.equal(isOutboxSyncEvent(eventType), true, eventType);
    }
  });

  it("ignores inbound and unrelated events", () => {
    assert.equal(isOutboxSyncEvent("email.received"), false);
    assert.equal(isOutboxSyncEvent("email.opened"), false);
    assert.equal(isOutboxSyncEvent("contact.updated"), false);
    assert.equal(isOutboxSyncEvent(""), false);
  });
});
