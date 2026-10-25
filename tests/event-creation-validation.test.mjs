import assert from "node:assert/strict";
import test from "node:test";
import {
  communicationFieldsOnly,
  containsControlCharacters,
  eventDateTimeToISOString,
  eventFieldsOnly,
  optionalEventText,
} from "../src/lib/event-validation.mjs";

test("eventFieldsOnly allows framework-injected $ACTION_ID keys while enforcing field whitelist", () => {
  const allowed = [
    "title",
    "event_type",
    "starts_at",
    "location",
    "description",
    "minutes_enabled",
    "attendance_enabled",
    "budget_enabled",
    "income_enabled",
    "expenses_enabled",
    "ticketing_enabled",
  ];

  // Simulating Next.js server-action formData with injected framework routing metadata
  const formData = new FormData();
  formData.append("$ACTION_ID_00e1c1112715090943f0699bd6dc7ad33a251218d5", "");
  formData.append("$ACTION_KEY", "action-key-value");
  formData.append("title", "End of Year Gathering");
  formData.append("event_type", "party");
  formData.append("starts_at", "2026-12-20T18:00");
  formData.append("location", "Grand Hall, Asaba");

  assert.equal(
    eventFieldsOnly(formData, allowed),
    true,
    "eventFieldsOnly must accept valid fields even when Next.js framework keys are present",
  );

  // When an unauthorized field is present
  formData.append("unauthorized_admin_override", "true");
  assert.equal(
    eventFieldsOnly(formData, allowed),
    false,
    "eventFieldsOnly must reject unexpected non-framework fields",
  );
});

test("communicationFieldsOnly allows framework-injected $ACTION_ID keys", () => {
  const allowed = ["event_id", "title", "message", "priority", "expires_at"];

  const formData = new FormData();
  formData.append("$ACTION_ID_abcdef1234567890", "");
  formData.append("title", "Important circular");
  formData.append("message", "General meeting agenda.");

  assert.equal(communicationFieldsOnly(formData, allowed), true);

  formData.append("malicious_extra_field", "evil");
  assert.equal(communicationFieldsOnly(formData, allowed), false);
});

test("eventDateTimeToISOString accepts both minute and second precision inputs", () => {
  // Minute precision: YYYY-MM-DDTHH:mm
  const fromMinute = eventDateTimeToISOString("2026-10-25T18:00");
  assert.equal(fromMinute, "2026-10-25T17:00:00.000Z");

  // Second precision: YYYY-MM-DDTHH:mm:ss (submitted by some browser/mobile date pickers)
  const fromSeconds = eventDateTimeToISOString("2026-10-25T18:00:00");
  assert.equal(fromSeconds, "2026-10-25T17:00:00.000Z");

  // Invalid date inputs fail closed to null
  assert.equal(eventDateTimeToISOString(""), null);
  assert.equal(eventDateTimeToISOString("not-a-date"), null);
  assert.equal(eventDateTimeToISOString(null), null);
  assert.equal(eventDateTimeToISOString("2026-02-29T12:00"), null); // non-leap year
});

test("optionalEventText normalizes multiline textarea linebreaks into clean spaces", () => {
  const formData = new FormData();
  formData.append(
    "description",
    "Item 1: General Assembly\r\nItem 2: Financial Reports\nItem 3: Refreshments",
  );

  const result = optionalEventText(formData, "description", 2000);
  assert.equal(
    result,
    "Item 1: General Assembly Item 2: Financial Reports Item 3: Refreshments",
    "Linebreaks should be normalized into clean spaces to satisfy DB single-line constraint",
  );

  // Empty or whitespace-only returns null
  const emptyForm = new FormData();
  emptyForm.append("description", "   \n\t  ");
  assert.equal(optionalEventText(emptyForm, "description", 2000), null);

  // Missing field returns null
  const missingForm = new FormData();
  assert.equal(optionalEventText(missingForm, "description", 2000), null);

  // Malicious control characters (null bytes) return undefined (invalid)
  const maliciousForm = new FormData();
  maliciousForm.append("description", "Malicious\x00text");
  assert.equal(
    optionalEventText(maliciousForm, "description", 2000),
    undefined,
  );
});

test("containsControlCharacters correctly identifies invalid control bytes", () => {
  assert.equal(containsControlCharacters("Clean string with spaces"), false);
  assert.equal(containsControlCharacters("Contains\x00null byte"), true);
  assert.equal(containsControlCharacters("Contains\x07bell"), true);
  assert.equal(containsControlCharacters("Contains\x7Fdelete"), true);
});
