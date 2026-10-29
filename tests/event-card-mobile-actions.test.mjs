import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const eventCardSource = fs.readFileSync(
  path.resolve("src/components/events/event-card.tsx"),
  "utf8"
);

test("event-card renders responsive mobile CTA container (sm:hidden) and desktop container (hidden sm:flex)", () => {
  assert.ok(
    eventCardSource.includes('className="sm:hidden space-y-2"'),
    "Expected mobile-only container with sm:hidden"
  );
  assert.ok(
    eventCardSource.includes('className="hidden sm:flex sm:items-center sm:justify-between gap-3"'),
    "Expected desktop container with hidden sm:flex"
  );
});

test("event-card mobile primary CTA uses min-h-[48px] and prominent styling", () => {
  assert.ok(
    eventCardSource.includes("min-h-[48px]"),
    "Mobile primary CTA must have minimum 48px touch target"
  );
  assert.ok(
    eventCardSource.includes("bg-[#174C37]"),
    "Primary CTA uses brand forest green background"
  );
  assert.ok(
    eventCardSource.includes("text-[#D6A23A]"),
    "Primary CTA uses gold accent arrow"
  );
});

test("event-card mobile management disclosure toggles cleanly with accessible aria labels", () => {
  assert.ok(
    eventCardSource.includes('aria-expanded={mobileActionsOpen}'),
    "Expected aria-expanded attribute on mobile actions trigger"
  );
  assert.ok(
    eventCardSource.includes('aria-label="Manage event options"'),
    "Expected accessible aria-label on mobile actions trigger"
  );
  assert.ok(
    eventCardSource.includes("Manage Event"),
    "Expected Manage Event label"
  );
});
