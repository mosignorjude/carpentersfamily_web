import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createSource = readFileSync(
  "src/components/events/create-event-disclosure.tsx",
  "utf8",
);
const editSource = readFileSync(
  "src/components/events/event-edit-modal.tsx",
  "utf8",
);

const scheduleFields = [
  "event_date",
  "start_hour",
  "start_minute",
  "meridiem",
  "duration_days",
];

for (const [name, source] of [
  ["create-event-disclosure.tsx", createSource],
  ["event-edit-modal.tsx", editSource],
]) {
  test(`${name} posts the split schedule fields`, () => {
    for (const field of scheduleFields) {
      assert.match(source, new RegExp(`name="${field}"`));
    }
    assert.doesNotMatch(
      source,
      /name="starts_at"/,
      "the combined datetime field must be gone",
    );
    assert.doesNotMatch(
      source,
      /datetime-local/,
      "no datetime-local control may survive",
    );
  });
}

test("the edit modal seeds its controls from the stored instant", () => {
  assert.match(editSource, /splitInstantForForm\(event\.starts_at\)/);
  assert.match(editSource, /minuteSelectOptions\(/);
  assert.doesNotMatch(
    editSource,
    /function dateTimeLocalValue/,
    "the hand-rolled +01:00 shim must be deleted, not left unused",
  );
});

test("the create form defaults to a single day", () => {
  assert.match(
    createSource,
    /name="duration_days"[\s\S]{0,200}defaultValue=\{?"1"\}?/,
  );
});

test("the schedule is entered as a date control, not a datetime-local", () => {
  for (const source of [createSource, editSource]) {
    assert.match(source, /type="date"/);
    assert.match(source, /name="meridiem"[\s\S]{0,400}>\s*AM\s*</);
    assert.match(source, /name="meridiem"[\s\S]{0,600}>\s*PM\s*</);
  }
});

