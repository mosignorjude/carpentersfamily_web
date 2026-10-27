import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DEFAULT_FROM_EMAIL,
  DEFAULT_REPLY_TO_EMAIL,
  extractEmailAddress,
  isContactRecipient,
} from "../src/lib/email/config.ts";

test("email templates omit the logo and keep the text brand header", () => {
  const layoutSource = fs.readFileSync(
    "src/lib/email/templates/base-layout.tsx",
    "utf8",
  );
  const testEmailSource = fs.readFileSync("scripts/send-test-email.mjs", "utf8");

  assert.doesNotMatch(layoutSource, /<Img|<img|email-avatar|logoImage/i);
  assert.match(layoutSource, /clubBrand\.name/);
  assert.doesNotMatch(testEmailSource, /\bImg\b|email-avatar/);
});

test("email address extraction and contact recipient validation", () => {
  assert.equal(
    extractEmailAddress("Carpenters Family <info@mail.carpentersfamily.com.ng>"),
    "info@mail.carpentersfamily.com.ng",
  );
  assert.equal(
    extractEmailAddress("contact@mail.carpentersfamily.com.ng"),
    "contact@mail.carpentersfamily.com.ng",
  );

  assert.equal(
    isContactRecipient(["contact@mail.carpentersfamily.com.ng"]),
    true,
  );
  assert.equal(
    isContactRecipient(["info@mail.carpentersfamily.com.ng"]),
    false,
  );
});

test("formats payment method and omits reference in dues email details", () => {
  const details = [
    { label: "Payment Channel", value: "Bank Transfer" },
    { label: "Receipt Evidence", value: "Attached & Verified" },
  ];
  const keys = details.map((d) => d.label);
  assert.equal(keys.includes("Payment Channel"), true);
  assert.equal(keys.includes("Payment Reference"), false);
});
