import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const field = readFileSync(
  new URL("../src/components/ui/cf-field.tsx", import.meta.url),
  "utf8",
);
const button = readFileSync(
  new URL("../src/components/ui/cf-button.tsx", import.meta.url),
  "utf8",
);
const forms = readFileSync(
  new URL("../src/app/(member)/finances/finance-forms.tsx", import.meta.url),
  "utf8",
);
const barrel = readFileSync(
  new URL("../src/components/ui/index.ts", import.meta.url),
  "utf8",
);

describe("form control baseline", () => {
  it("exports the field primitives", () => {
    assert.match(barrel, /export \* from "\.\/cf-field"/);
  });

  it("uses 48px controls with 16px text", () => {
    assert.match(field, /min-h-\[3rem\]/);
    assert.match(field, /text-base/);
    assert.doesNotMatch(field, /h-10|text-xs|text-\[1[1234]px\]/);
  });

  it("labels are real label elements, never placeholder-only", () => {
    // Bounded [\s\S] gaps, not `\s+`: Biome wraps multi-attribute JSX at 80
    // columns, so a regex demanding same-line adjacency cannot pass here.
    assert.match(field, /<label[\s\S]{0,160}?htmlFor=\{htmlFor\}/);
    assert.match(field, /id=\{htmlId\}/);
    assert.match(field, /aria-describedby=\{describedBy\}/);
    // The referenced ids must be the ids that are actually rendered, or
    // aria-describedby points at nothing and the hint is never announced.
    assert.match(
      field,
      /const hintId = hint \? `\$\{htmlId\}-hint` : undefined/,
    );
    assert.match(
      field,
      /const errorId = error \? `\$\{htmlId\}-error` : undefined/,
    );
    assert.match(
      field,
      /const describedBy = \[hintId, errorId\]\.filter\(Boolean\)\.join\(" "\) \|\| undefined/,
    );
    // Tightened from the brief's literal /-desc/, which cannot pass: the same
    // test requires `aria-describedby={describedBy}`, and that attribute name
    // is itself "-desc"+"ribedBy" (JSX has no other spelling). The pinned
    // intent survives intact — what must not come back is the `-desc` *id
    // suffix* of defect note 1, i.e. `${htmlId}-desc`, which this still catches.
    assert.doesNotMatch(field, /-desc(?!ribed)/);
  });

  it("keeps no CfButton size below 44px", () => {
    const sizes =
      button.match(/"(default|compact|large|icon)":\s*"([^"]+)"/g) ?? [];
    for (const size of sizes) {
      assert.match(size, /h-11|h-12/, `below the 44px floor: ${size}`);
    }
    assert.match(button, /icon:\s*"[^"]*h-11[^"]*w-11/);
  });

  it("money-entry forms use the primitives", () => {
    assert.match(forms, /<CfTextField/);
    assert.match(forms, /<CfSelect/);
    assert.doesNotMatch(forms, /h-10/);
  });
});
