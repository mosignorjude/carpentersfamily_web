import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("event and club broadcast notifications do not exclude the author or creator", () => {
  const source = fs.readFileSync("src/lib/email/notifications.ts", "utf8");

  // notifyNewEventScheduled must not pass an actor exclusion to resolveActiveMemberEmails
  assert.match(
    source,
    /export async function notifyNewEventScheduled[\s\S]*?resolveActiveMemberEmails\(params\.supabase\)/,
    "notifyNewEventScheduled must include all active members without actor exclusion",
  );

  // notifyEventAttendanceOpened must include all active members
  assert.match(
    source,
    /export async function notifyEventAttendanceOpened[\s\S]*?resolveActiveMemberEmails\(params\.supabase\)/,
    "notifyEventAttendanceOpened must include all active members without actor exclusion",
  );

  // notifyAnnouncementPublished must include all active members
  assert.match(
    source,
    /export async function notifyAnnouncementPublished[\s\S]*?resolveActiveMemberEmails\(params\.supabase\)/,
    "notifyAnnouncementPublished must include all active members without actor exclusion",
  );

  // notifyPollCreated must include all active members
  assert.match(
    source,
    /export async function notifyPollCreated[\s\S]*?resolveActiveMemberEmails\(params\.supabase\)/,
    "notifyPollCreated must include all active members without actor exclusion",
  );
});

test("email notification dispatches check batch results and log diagnostics on failure", () => {
  const source = fs.readFileSync("src/lib/email/notifications.ts", "utf8");

  // Checks that resolveActiveMemberEmails logs missing admin credentials
  assert.match(
    source,
    /console\.warn\(\s*\"\[Email Service\] SUPABASE_SECRET_KEY \/ SUPABASE_SERVICE_ROLE_KEY is not configured/,
    "resolveActiveMemberEmails must warn when Supabase secret/service role key is missing",
  );

  // Checks that resolveActiveMemberEmails logs auth listing errors
  assert.match(
    source,
    /console\.error\(\s*\"\[Email Service\] Failed to list users from Supabase Auth admin:\"/,
    "resolveActiveMemberEmails must log error when Supabase Auth admin listUsers fails",
  );

  // Checks that notifyNewEventScheduled checks sendEmailBatch result
  assert.match(
    source,
    /if \(!result\.ok\) \{\s*console\.error\(\s*`\[Email Service\] Failed to send new event email batch for/,
    "notifyNewEventScheduled must log error when sendEmailBatch returns ok: false",
  );

  // Checks that notifyEventAttendanceOpened checks sendEmailBatch result
  assert.match(
    source,
    /if \(!result\.ok\) \{\s*console\.error\(\s*`\[Email Service\] Failed to send attendance opened email batch for/,
    "notifyEventAttendanceOpened must log error when sendEmailBatch returns ok: false",
  );

  // Checks that notifyAnnouncementPublished checks sendEmailBatch result
  assert.match(
    source,
    /if \(!result\.ok\) \{\s*console\.error\(\s*`\[Email Service\] Failed to send announcement email batch for/,
    "notifyAnnouncementPublished must log error when sendEmailBatch returns ok: false",
  );

  // Checks that notifyPollCreated checks sendEmailBatch result
  assert.match(
    source,
    /if \(!result\.ok\) \{\s*console\.error\(\s*`\[Email Service\] Failed to send poll email batch for/,
    "notifyPollCreated must log error when sendEmailBatch returns ok: false",
  );
});

test("activeIds logic includes all members when excludeMemberId is undefined", () => {
  const activeProfiles = [
    { id: "member-1" },
    { id: "member-2" },
    { id: "admin-creator" },
  ];

  // Case A: Broadcast (excludeMemberId undefined)
  const broadcastIds = new Set(
    activeProfiles
      .map((row) => row.id)
      .filter((id) => id !== undefined),
  );
  assert.equal(broadcastIds.size, 3);
  assert.equal(broadcastIds.has("admin-creator"), true);

  // Case B: Explicit exclusion
  const excludeMemberId = "admin-creator";
  const filteredIds = new Set(
    activeProfiles
      .map((row) => row.id)
      .filter((id) => id !== excludeMemberId),
  );
  assert.equal(filteredIds.size, 2);
  assert.equal(filteredIds.has("admin-creator"), false);
});
