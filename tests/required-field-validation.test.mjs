import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const authFormSource = readFileSync(
  new URL("../src/components/auth-validated-form.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);

describe("Field-specific required validation", () => {
  it("formats required field error message with the specific field label or name", () => {
    assert.match(
      authFormSource,
      /Please enter|getFieldLabel/,
      "auth-validated-form must generate 'Please enter [field name]'",
    );
    assert.doesNotMatch(
      authFormSource,
      /return "Please fill in this field\."/,
      "Must not use generic 'Please fill in this field.'",
    );
  });

  it("specifies field names or labels for sign in email and password", () => {
    assert.match(
      pageSource,
      /data-field-name="email address"/,
      "Email field must configure field name for validation feedback",
    );
    assert.match(
      pageSource,
      /data-field-name="password"/,
      "Password field must configure field name for validation feedback",
    );
  });
});
