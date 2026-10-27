import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261027140652_notification_outbox_worker_schedule.sql",
    import.meta.url,
  ),
  "utf8",
);

test("the outbox worker schedule uses the existing Vault secrets and protected route", () => {
  assert.match(migration, /cron\.schedule\(/);
  assert.match(migration, /'carpenters-notification-outbox'/);
  assert.match(migration, /'\* \* \* \* \*'/);
  assert.match(migration, /notification_worker_url/);
  assert.match(migration, /notification_cron_secret/);
  assert.match(migration, /\/api\/internal\/notifications\/process-outbox/);
  assert.match(migration, /'Authorization',\s*'Bearer '/);
  assert.match(migration, /cron\.unschedule/);
  assert.doesNotMatch(migration, /CRON_SECRET\s*[:=]\s*['"][^'"]+['"]/);
});
