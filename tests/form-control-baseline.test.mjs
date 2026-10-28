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
const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const payDues = readFileSync(
  new URL("../src/components/dues/pay-dues-modal.tsx", import.meta.url),
  "utf8",
);

// The four modal hosts that render the migrated money-entry forms. Each one's
// outer panel carries `overflow-hidden`, so without a scroll container on the
// content row the submit button falls off a short phone viewport with no
// scrollbar and no page scroll.
const modalHosts = [
  "record-income-modal.tsx",
  "record-expense-modal.tsx",
  "void-transaction-modal.tsx",
  "correct-transaction-modal.tsx",
].map((name) => ({
  name,
  source: readFileSync(
    new URL(`../src/components/finances/${name}`, import.meta.url),
    "utf8",
  ),
}));

describe("form control baseline", () => {
  it("exports the field primitives", () => {
    assert.match(barrel, /export \* from "\.\/cf-field"/);
  });

  it("uses 48px controls with 16px text", () => {
    assert.match(field, /min-h-\[3rem\]/);
    assert.match(field, /text-base/);
    assert.doesNotMatch(field, /h-10|text-xs|text-\[1[1234]px\]/);
  });

  it("radiuses controls with the 10px control token, not the 12px card token", () => {
    // DESIGN.md: "Cards use a restrained 12px radius; controls use 10px."
    // `rounded-xl` is the card token, so CONTROL consumes the declared
    // `--radius-control` value instead. Pinned both ways: the utility must name
    // the token, the card token must not come back, and the token it names must
    // still exist with the contract value.
    assert.match(field, /rounded-\[var\(--radius-control\)\]/);
    assert.doesNotMatch(field, /rounded-xl/);
    assert.match(css, /--radius-control:\s*0\.625rem/);
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

  it("spreads caller props before its derived accessibility wiring", () => {
    // A caller that passes `aria-describedby`/`aria-invalid` must not be able to
    // un-wire what the primitive renders, so the prop spread has to come first
    // on both controls. Positional rather than textual: the two elements sit
    // many lines apart, and only their order carries the rule.
    const spreads = [...field.matchAll(/\{\.\.\.props\}/g)];
    const derived = [...field.matchAll(/aria-describedby=\{describedBy\}/g)];
    assert.equal(spreads.length, 2, "one prop spread per primitive control");
    assert.equal(derived.length, 2, "one derived wiring per primitive control");
    spreads.forEach((spread, index) => {
      assert.ok(
        spread.index < derived[index].index,
        `caller props must be spread before the derived wiring (control ${index + 1})`,
      );
    });
  });

  it("keeps the primitive's error paragraph assertive, on purpose", () => {
    // Ruled in the Task 4 review: an error raised by the user's own submit is
    // announced assertively, which is what `role="alert"` gives. The sibling
    // `FormFieldError` stays polite for now; unifying the two is Phase 2.
    // Pinned so neither choice can drift back silently.
    const errorBranch = field.match(/\{error \? \(([\s\S]*?)\) : null\}/);
    assert.ok(
      errorBranch,
      "CfFieldLayout must render its error paragraph from the error prop",
    );
    assert.match(errorBranch[1], /role="alert"/);
    assert.doesNotMatch(errorBranch[1], /aria-live/);
    assert.doesNotMatch(field, /aria-live="polite"/);
  });

  it("keeps no CfButton size below 44px", () => {
    // Unquoted object keys (`default: "h-12 …"`) are how `sizeStyles` is
    // declared, so the brief's quoted-key regex never matched anything and the
    // loop below guarded nothing. The length guard is the substance of this
    // fix: without it, the next key rename or reformat silently re-inerts the
    // test instead of failing it.
    const sizes =
      button.match(/\b(default|compact|large|icon):\s*"([^"]+)"/g) ?? [];
    assert.equal(sizes.length, 4, "every CfButton size must be measured");
    for (const size of sizes) {
      assert.match(size, /h-11|h-12/, `below the 44px floor: ${size}`);
    }
    assert.match(button, /icon:\s*"[^"]*h-11[^"]*w-11/);
  });

  it("gives every money-entry modal host a scroll container", () => {
    // These four hosts wrap the migrated forms in a panel that carries
    // `overflow-hidden`. Without a scroll region on the content row, the submit
    // button falls off a short phone viewport with no scrollbar and no page
    // scroll. Same shape the sibling modals already use.
    assert.equal(modalHosts.length, 4);
    for (const host of modalHosts) {
      assert.match(
        host.source,
        /max-h-\[75vh\] overflow-y-auto/,
        `${host.name} clips its own form: the content row needs a scroll region`,
      );
    }
  });

  it("runs the Pay Dues receipt field through the shared primitive", () => {
    // The last sub-floor money-entry control in the most-used phone dues path.
    assert.match(payDues, /<CfTextField/);
    assert.match(payDues, /id="dues-receipt-file"/);
    // Its hand-rolled label is gone: the primitive owns that association now.
    assert.doesNotMatch(payDues, /htmlFor="dues-receipt-file"/);
  });

  it("money-entry forms use the primitives", () => {
    assert.match(forms, /<CfTextField/);
    assert.match(forms, /<CfSelect/);
    assert.doesNotMatch(forms, /h-10/);
    // No hand-rolled floor below the 44px target survives in this file: the
    // raw Cancel/Close buttons are raised, and the `FormSubmitButton`
    // `min-h-[40px]` overrides (a second owner of a height `h-12` already sets)
    // are gone.
    assert.doesNotMatch(forms, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/);
    // Fixed `h-N` is the other way a control hides under the floor: `h-9` on
    // the category name and `h-8` on the retirement reason were the last two,
    // and neither is expressible as a `min-h-` regression.
    assert.doesNotMatch(forms, /\bh-(6|7|8|9|10)\b/);
    // One error implementation per migrated control. `FormFieldError` renders
    // 11px polite text beside the primitive's 14px assertive paragraph, which
    // is the two-styles-on-one-screen defect the review flagged; the money
    // forms now own exactly one of them.
    assert.doesNotMatch(forms, /FormFieldError/);
  });

  it("keeps every association in the money forms resolvable", () => {
    // A `htmlFor` or `aria-describedby` that names a missing id is invisible to
    // a sighted reviewer and silent to a screen reader, and neither a dropped
    // `errorId` nor a renamed control id shows up in any other assertion here.
    // Two id sources count as rendered: a literal `id="…"` in this file, and an
    // `errorId="…"` handed to `CfFieldLayout`, which gives that id to the error
    // paragraph it renders for the money inputs.
    const literalIds = new Set(
      [...forms.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
    );
    const layoutErrorIds = new Set(
      [...forms.matchAll(/errorId="([^"]+)"/g)].map((match) => match[1]),
    );
    for (const match of forms.matchAll(/htmlFor="([^"]+)"/g)) {
      assert.ok(
        literalIds.has(match[1]),
        `htmlFor names a missing id: ${match[1]}`,
      );
    }
    const describedTargets = [
      ...forms.matchAll(/aria-describedby=\{[\s\S]{0,140}?"([^"]+)"/g),
    ].map((match) => match[1]);
    for (const target of describedTargets) {
      assert.ok(
        literalIds.has(target) || layoutErrorIds.has(target),
        `description points at a node this file never renders: ${target}`,
      );
    }
    assert.equal(
      describedTargets.length,
      2,
      "the two money inputs must keep their error association wired",
    );
  });
});
