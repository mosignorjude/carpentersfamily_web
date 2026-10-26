import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readSource(path) {
  return fs.readFileSync(path, "utf8");
}

test("broadcast notifications enqueue for every active member without actor exclusion", () => {
  const source = readSource("src/lib/email/notifications.ts");

  for (const name of [
    "notifyNewEventScheduled",
    "notifyEventChanged",
    "notifyEventCancelled",
    "notifyEventAttendanceOpened",
    "notifyAnnouncementPublished",
    "notifyPollCreated",
  ]) {
    assert.match(
      source,
      new RegExp(
        `export async function ${name}\\([\\s\\S]*?await queueBroadcast\\(`,
      ),
      `${name} must fan out to the outbox broadcast RPC`,
    );
  }

  assert.doesNotMatch(source, /excludeMemberId|resolveActiveMemberEmails/);
  assert.doesNotMatch(source, /sendEmailBatch|sendEmail\(/);
});

test("outbox enqueue and dispatch failures log actionable diagnostics", () => {
  const outbox = readSource("src/lib/notifications/outbox-service.ts");

  assert.match(
    outbox,
    /\[Notification Outbox\] SUPABASE_SECRET_KEY is not configured/,
    "missing service credentials must be reported",
  );
  assert.match(
    outbox,
    /\[Notification Outbox\] Failed to enqueue email:/,
    "single enqueue failures must be reported",
  );
  assert.match(
    outbox,
    /\[Notification Outbox\] Failed to enqueue broadcast:/,
    "broadcast enqueue failures must be reported",
  );

  const worker = readSource("src/lib/notifications/outbox-worker.ts");
  assert.match(
    worker,
    /classifyProviderFailure/,
    "provider failures must be classified before rescheduling",
  );
  assert.match(
    worker,
    /pausedForRateLimit/,
    "rate-limit pauses must be surfaced in the worker summary",
  );
});
