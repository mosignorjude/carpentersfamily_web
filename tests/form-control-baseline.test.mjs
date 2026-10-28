import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { declares, parseCss } from "./helpers/css-rules.mjs";

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

// --- touch-target sweep ----------------------------------------------------
// DESIGN.md:25 sets a 44px floor for controls and says they "never fall below"
// it. The shape this suite used to check that with was a per-file
// `doesNotMatch(/min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/)`, which recognises one
// spelling of a too-small box. Every dialog close button in this repo is
// `p-2` around a `w-5` icon — 36px, a sub-floor target that pattern cannot see,
// and neither can it see `h-9`, `py-1.5`, or a `min-h-[44px]` landed on the
// wrapper instead of the control. So this sweep measures elements: each file
// below must give every hand-rolled control an explicit floor it can read.
// Primitives (`<CfTextField>`, `<FormSubmitButton>`) are not controls this
// scanner can size; their own floors are pinned above, and the block that
// follows this one watches the caller side of that seam.
const FLOOR_PX = 44;
// Tailwind v4 derives the scale from `--spacing: 0.25rem`, so `min-h-11` is
// 44px and `min-h-12` is 48px. Both spellings satisfy the floor.
const SPACING_PX = 4;

/** Files whose controls Phase 1 owns. `finance-forms.tsx` was raised by Task 4
 *  and is listed so a later edit cannot quietly re-inert its floor. */
const PHASE1_CONTROL_FILES = [
  "src/app/(member)/finances/finance-forms.tsx",
  "src/components/dues/pay-dues-modal.tsx",
  "src/components/finances/category-management-modal.tsx",
  "src/components/finances/correct-transaction-modal.tsx",
  "src/components/finances/receipt-modal.tsx",
  "src/components/finances/record-expense-modal.tsx",
  "src/components/finances/record-income-modal.tsx",
  "src/components/finances/void-transaction-modal.tsx",
];

/** The seven dialogs of `PHASE1_CONTROL_FILES` that own a close affordance. */
const PHASE1_CLOSE_BUTTON_FILES = [
  "src/components/dues/pay-dues-modal.tsx",
  "src/components/finances/category-management-modal.tsx",
  "src/components/finances/correct-transaction-modal.tsx",
  "src/components/finances/receipt-modal.tsx",
  "src/components/finances/record-expense-modal.tsx",
  "src/components/finances/record-income-modal.tsx",
  "src/components/finances/void-transaction-modal.tsx",
];

/** Per-file control counts, measured at this commit. Exact on purpose: if the
 *  scanner starts returning nothing — a renamed tag, a reformat, a stricter
 *  regex — the suite has to say so instead of guarding zero elements. */
const CONTROLS_PER_FILE = new Map([
  ["src/app/(member)/finances/finance-forms.tsx", 6],
  ["src/components/dues/pay-dues-modal.tsx", 11],
  ["src/components/finances/category-management-modal.tsx", 1],
  ["src/components/finances/correct-transaction-modal.tsx", 1],
  ["src/components/finances/receipt-modal.tsx", 3],
  ["src/components/finances/record-expense-modal.tsx", 1],
  ["src/components/finances/record-income-modal.tsx", 1],
  ["src/components/finances/void-transaction-modal.tsx", 1],
]);

/** Dialogs that still own a sub-floor close affordance. Logged, not measured:
 *  migrating them is Phase 2. Moving a path from here to the list above is what
 *  finishing that work looks like. */
const DEFERRED_CLOSE_BUTTONS = [
  "src/app/(member)/events/event-action-dialog.tsx",
  "src/components/communications/announcement-edit-modal.tsx",
  "src/components/communications/poll-edit-modal.tsx",
  "src/components/events/attendance/attendance-roster-table.tsx",
  "src/components/events/dashboard/modals/correct-transaction-modal.tsx",
  "src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx",
  "src/components/events/dashboard/modals/event-category-management-modal.tsx",
  "src/components/events/dashboard/modals/event-ticket-tier-modal.tsx",
  "src/components/events/dashboard/modals/record-transaction-modal.tsx",
  "src/components/events/dashboard/modals/transaction-detail-modal.tsx",
  "src/components/events/dashboard/modals/void-transaction-modal.tsx",
  "src/components/events/event-edit-modal.tsx",
  "src/components/events/event-lifecycle-modal.tsx",
];

/**
 * Index of the `>` that closes the opening tag starting at `lt`, or -1.
 * Tracks braces and quotes: a JSX attribute value is often an arrow function,
 * and its `=>` is the first `>` on the line. A regex that stops at the first
 * `>` therefore cuts the tag in half and reads the class list of nothing.
 */
function tagEnd(source, lt) {
  let brace = 0;
  let quote = null;
  for (let i = lt + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === ">" && brace === 0) return i;
  }
  return -1;
}

/**
 * The class list an element's `className` declares, or null if it is built at
 * runtime. A template literal counts as static up to its first `${ }`: the
 * conditional tail swaps colours, and a floor that only appears in one branch
 * is not a floor.
 */
function classesOf(attrs) {
  const literal = attrs.match(/(?:^|\s)className="([^"]*)"/);
  if (literal) return literal[1].trim().split(/\s+/);
  const template = attrs.match(/(?:^|\s)className=\{\s*`([^`]*)/);
  if (template) return template[1].split("${")[0].trim().split(/\s+/);
  return null;
}

function pxOf(value) {
  const match = /^(\d*\.?\d+)(px|rem)$/.exec(value);
  if (match === null) return null;
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

/**
 * The px floor `classes` declares for `prop` ("min-h" or "min-w"): a token, or
 * null when absent. `{ px: null }` means a token exists but this resolver could
 * not read it (e.g. `min-h-[calc(100%-2rem)]`) — callers must treat that as a
 * failure, because "unmeasurable" and "absent" lead to the same silent bug.
 */
function declaredFloor(classes, prop) {
  for (const token of classes) {
    const leaf = token.split(":").at(-1);
    const match = new RegExp(`^${prop}-(\\[.+\\]|\\d+)$`).exec(leaf);
    if (match === null) continue;
    if (match[1].startsWith("[")) {
      return { px: pxOf(match[1].slice(1, -1)), token };
    }
    return { px: Number(match[1]) * SPACING_PX, token };
  }
  return null;
}

/**
 * Hand-rolled controls in `source`: lowercase interactive elements, plus the
 * `<label>` elements that wrap one (a nested input makes the whole label the
 * tap target, which is how the dues month picker works).
 */
function controls(source) {
  const out = [];
  for (const tag of ["button", "input", "textarea", "select", "label"]) {
    const opener = new RegExp(`<${tag}(?![\\w-])`, "g");
    let match = opener.exec(source);
    while (match !== null) {
      const at = match.index;
      const end = tagEnd(source, at);
      assert.notEqual(
        end,
        -1,
        `<${tag}> at offset ${at} has no closing > — the scanner cannot read this file`,
      );
      const attrs = source.slice(at + tag.length + 1, end);
      const type = (attrs.match(/(?:^|\s)type="([^"]*)"/) ?? [])[1];
      const classes = classesOf(attrs);
      if (type === "hidden") {
        // carries no box at all
      } else if (tag === "label") {
        const closing = source.indexOf("</label>", end);
        const wraps =
          closing !== -1 &&
          /<(?:input|textarea|select)(?![\w-])/.test(
            source.slice(end + 1, closing),
          );
        if (wraps)
          out.push({
            tag,
            at,
            end,
            attrs,
            classes,
            type,
            iconOnly: false,
          });
      } else if (classes?.includes("fixed") && classes?.includes("inset-0")) {
        // the backdrop: its tap target is the whole viewport
      } else if (
        (type === "checkbox" || type === "radio") &&
        source.lastIndexOf("<label", at) > source.lastIndexOf("</label>", at)
      ) {
        // measured through its wrapping label
      } else {
        const closing = source.indexOf(`</${tag}>`, end);
        const inner = closing === -1 ? "" : source.slice(end + 1, closing);
        out.push({
          tag,
          at,
          end,
          attrs,
          classes,
          type,
          iconOnly:
            tag === "button" &&
            /^<[A-Z][A-Za-z0-9]*[\s\S]*\/>$/.test(inner.trim()),
        });
      }
      match = opener.exec(source);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The `min-height` `globals.css` already guarantees for a *bare* element selector
 * (`textarea { … }`, not `.some-scope textarea`), plus whether an element utility
 * can beat it. The layer decides: unlayered author CSS outranks every utility,
 * while a rule inside `@layer base` loses to one regardless of specificity. So
 * `min-h-[44px]` on a `<textarea>` whose base floor is `7rem` is a shrink, and the
 * same token against an unlayered rule would instead be a dead letter.
 */
const DOCUMENT = parseCss(css);

function lengthPx(value, seen = new Set()) {
  if (value === null || seen.has(value)) return null;
  const literal = pxOf(value);
  if (literal !== null) return literal;
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable === null) return null;
  seen.add(value);
  const declared = DOCUMENT.rules
    .map((rule) => declares(rule.body, variable[1]))
    .filter((found) => found !== null)
    .at(-1);
  return lengthPx(declared, seen);
}

function authorFloor(tag) {
  const bare = (selector) =>
    selector.split(",").some(
      (part) =>
        part
          .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "")
          .trim()
          .split(/[\s>+~]+/)
          .at(-1) === tag &&
        !part.includes(" ") &&
        !part.includes(".") &&
        !part.includes("#"),
    );
  const hits = DOCUMENT.rules
    .filter(
      (rule) =>
        rule.media === "" &&
        bare(rule.selector) &&
        declares(rule.body, "min-height") !== null,
    )
    .at(-1);
  if (hits === undefined) return null;
  return {
    px: lengthPx(declares(hits.body, "min-height")),
    raw: declares(hits.body, "min-height"),
    layer: hits.layer,
    selector: hits.selector,
  };
}

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
    // The hint paragraph renders only on `hint && !error` — with an active error
    // it is deliberately dropped — so `hintId` has to be derived from that same
    // predicate. Deriving it from `hint` alone left an errored field carrying
    // `aria-describedby="<id>-hint <id>-error"` where the first idref names a
    // node that is not in the tree. Counted per primitive, not matched once:
    // `CfTextField` and `CfSelect` are separate implementations of the same
    // wiring, and pinning only the first would leave the second free to drift.
    const hintDerivations =
      field.match(
        /const hintId = hint && !error \? `\$\{htmlId\}-hint` : undefined/g,
      ) ?? [];
    assert.equal(
      hintDerivations.length,
      2,
      "both primitives must derive hintId from the render predicate",
    );
    assert.equal(
      (field.match(/\{hint && !error \?/g) ?? []).length,
      1,
      "the hint renders from exactly one shared site",
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
    //
    // 44 is DESIGN.md's floor, 48 is its preferred size. `h-11` = 2.75rem =
    // exactly the floor and is legal only for the two dense variants
    // (`compact`, `icon`); `default` and `large` sit on `h-12` = 3rem = 48px.
    // Resolved as lengths rather than matched as text, so a size that says
    // `h-[2.75rem]` or `min-h-12` passes on its box, not on its spelling.
    const sizes = [
      ...button.matchAll(/\b(default|compact|large|icon):\s*"([^"]+)"/g),
    ];
    assert.equal(sizes.length, 4, "every CfButton size must be measured");
    for (const [, name, value] of sizes) {
      const tokens = value.trim().split(/\s+/);
      const height =
        declaredFloor(tokens, "h") ?? declaredFloor(tokens, "min-h");
      assert.ok(
        height !== null,
        `CfButton size "${name}" sets no h-*/min-h-* token: ${value}`,
      );
      assert.ok(
        height.px !== null,
        `CfButton size "${name}": "${height.token}" is not a length this resolver can read`,
      );
      assert.ok(
        height.px >= FLOOR_PX,
        `CfButton size "${name}" is ${height.px}px, below the ${FLOOR_PX}px floor`,
      );
      if (name !== "icon") continue;
      // Both axes: an icon button has no label to give it width. Measured as a
      // token set, not the `h-11 … w-11` sequence this file used to require —
      // reordering two utilities changes nothing on screen and broke the pin.
      const width =
        declaredFloor(tokens, "w") ?? declaredFloor(tokens, "min-w");
      assert.ok(
        width !== null && width.px !== null,
        `CfButton size "icon" has no readable w-* token: ${value}`,
      );
      assert.ok(
        width.px >= FLOOR_PX,
        `CfButton size "icon" is ${width.px}px wide, below the ${FLOOR_PX}px floor`,
      );
      assert.ok(
        tokens.includes("justify-center"),
        `CfButton size "icon" does not centre its glyph: ${value}`,
      );
    }
  });

  it("gives every hand-rolled control in the Phase-1 dialogs an explicit floor", () => {
    const tally = new Map();
    const offenders = [];
    for (const rel of PHASE1_CONTROL_FILES) {
      const source = readFileSync(
        new URL(`../${rel}`, import.meta.url),
        "utf8",
      );
      const found = controls(source);
      tally.set(rel, found.length);
      for (const control of found) {
        // Collect, do not short-circuit: one run has to name every sub-floor control
        // PHASE1_CONTROL_FILES contains, because the first assert.ok that throws hides
        // the rest and a fix that stops at the reported one leaves the defect alive.
        // What this sweep cannot see, recorded so nobody reads the green as coverage of
        // the app: `controls()` walks lowercase button/input/textarea/select/label, so an
        // `<a role="button">` is not a control here; `declaredFloor` strips variant
        // prefixes and stops at the first token, so a `min-h-[44px]` followed by a smaller
        // `max-md:` floor reads as 44px; and `iconOnly` needs an uppercase child, so a `<button>` wrapping `<svg>`
        // never has its width asked. Widening them is Phase 2 work, with mutations, not a
        // edit to this loop.
        const problems = [];
        const label = (control.attrs.match(
          /(?:^|\s)(?:aria-label|id)="([^"]*)"/,
        ) ?? [])[1];
        const at = `${rel}:<${control.tag}${label ? ` ${label}` : ""}>`;
        if (control.classes === null) {
          problems.push(
            "className is built at runtime, so no floor can be read from it — compose it from a literal or use a primitive",
          );
        } else {
          const height = declaredFloor(control.classes, "min-h");
          if (height === null) {
            problems.push(
              "carries no min-h token; its box comes from padding around content, which is how a 36px close button passes for a control",
            );
          } else if (height.px === null) {
            problems.push(
              `min-h token "${height.token}" is not a length this resolver can read; use px or rem`,
            );
          } else if (height.px < FLOOR_PX) {
            problems.push(
              `${height.px}px floor is below the ${FLOOR_PX}px DESIGN.md target`,
            );
          }
          if (control.iconOnly) {
            // An icon-only box has no text to give it width, so both axes need
            // the floor, and the glyph has to be centred once the box outgrows it.
            for (const token of ["flex", "items-center", "justify-center"]) {
              if (!control.classes.includes(token)) {
                problems.push(
                  `icon-only but missing ${token}, so the glyph sits against one edge`,
                );
              }
            }
            const width = declaredFloor(control.classes, "min-w");
            if (width === null) {
              problems.push("icon-only button with no min-w token");
            } else if (width.px === null) {
              problems.push(
                `min-w token "${width.token}" is not a length this resolver can read; use px or rem`,
              );
            } else if (width.px < FLOOR_PX) {
              problems.push(
                `${width.px}px wide, below the ${FLOOR_PX}px floor`,
              );
            }
          }
        }
        for (const problem of problems) offenders.push(`${at}: ${problem}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `sub-floor or unreadable controls:\n    ${offenders.join("\n    ")}`,
    );
    assert.deepEqual(
      Object.fromEntries(tally),
      Object.fromEntries(CONTROLS_PER_FILE),
      "the sweep's inventory moved: a control was added, removed, or became unreadable",
    );
  });

  it("never lets a utility token shrink the floor globals.css already gives a control", () => {
    // The sibling sweep above asks "does this control own a floor, and is it
    // >= 44px" — a question that cannot see a token making a control *smaller*.
    // `@layer base` gives a bare `textarea` 7rem and a bare `input`/`select`
    // `var(--control-height)` (48px); a utility lands in Tailwind's `utilities`
    // layer, which is later than `base`, so `min-h-[44px]` on a notes textarea is
    // a 112px -> 54px shrink that measures compliant. Design's own number for
    // inputs is 48px, so the base floor is the one to respect, not overwrite.
    const offenders = [];
    const floors = new Map();
    for (const rel of PHASE1_CONTROL_FILES) {
      const source = readFileSync(
        new URL(`../${rel}`, import.meta.url),
        "utf8",
      );
      for (const control of controls(source)) {
        if (control.type === "checkbox" || control.type === "radio") continue;
        const base = authorFloor(control.tag);
        if (base === null) continue;
        if (base.px === null) {
          offenders.push(
            `${rel}:<${control.tag}> — globals.css floors this tag at "${base.raw}", ` +
              `set by "${base.selector}", a value this resolver cannot read`,
          );
          continue;
        }
        floors.set(control.tag, base);
        if (control.classes === null) continue;
        const token = declaredFloor(control.classes, "min-h");
        if (token === null || token.px === null) continue;
        if (base.layer === null) {
          // Unlayered author CSS outranks the utility: the token is a dead letter,
          // and a guard that counted it as the floor would be reading a number the
          // browser never applies.
          offenders.push(
            `${rel}:<${control.tag}> declares ${token.token}, but the unlayered rule ` +
              `"${base.selector}" already sets min-height: ${base.px}px, which wins — ` +
              "the token does nothing",
          );
          continue;
        }
        if (token.px < base.px) {
          offenders.push(
            `${rel}:<${control.tag}> declares ${token.token} = ${token.px}px, below the ` +
              `${base.px}px its "@layer ${base.layer}" rule already guarantees — the ` +
              "utility wins, so this shrinks the control",
          );
        }
      }
    }
    assert.ok(
      floors.size >= 2,
      `only ${floors.size} tag(s) were compared; the base floor for textarea/input/select ` +
        "disappeared from globals.css and this sweep is now inert",
    );
    assert.deepEqual(
      offenders,
      [],
      `tokens that lower an existing floor:\n    ${offenders.join("\n    ")}`,
    );
  });

  it("stops a caller from overriding a primitive's floor", () => {
    // The sweep above reads lowercase tags, so `<FormSubmitButton>` and
    // `<CfTextField>` are invisible to it: their height belongs to the
    // primitive, and the blocks above pin that. What it cannot see is the
    // other direction — a caller handing the primitive a `min-h-[32px]`, which
    // is how a compliant component ends up with a sub-floor box. Icons are
    // excluded by looking only at `min-h`: every glyph in these files sizes
    // itself with `h-`, which sets an icon, never a target.
    const offenders = [];
    for (const rel of PHASE1_CONTROL_FILES) {
      const source = readFileSync(
        new URL(`../${rel}`, import.meta.url),
        "utf8",
      );
      const opener = /<([A-Z]\w*)\b/g;
      let match = opener.exec(source);
      while (match !== null) {
        const end = tagEnd(source, match.index);
        const classes =
          end === -1
            ? null
            : classesOf(source.slice(match.index + match[0].length, end));
        const floor = classes === null ? null : declaredFloor(classes, "min-h");
        if (floor !== null && (floor.px === null || floor.px < FLOOR_PX)) {
          offenders.push(
            `${rel}:<${match[1]}> declares ${floor.token}; the primitive it wraps already owns a ${FLOOR_PX}px floor`,
          );
        }
        match = opener.exec(source);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `caller-supplied height overrides:\n    ${offenders.join("\n    ")}`,
    );
  });

  it("inventories every dialog close affordance so a new modal cannot opt out", () => {
    const repo = fileURLToPath(new URL("../", import.meta.url));
    const walk = (dir) =>
      readdirSync(join(repo, dir)).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(join(repo, path)).isDirectory() ? walk(path) : [path];
      });
    const found = walk("src")
      .filter((path) => path.endsWith(".tsx"))
      .filter((path) =>
        readFileSync(join(repo, path), "utf8").includes(
          'aria-label="Close dialog"',
        ),
      )
      .sort();
    const expected = [
      ...PHASE1_CLOSE_BUTTON_FILES,
      ...DEFERRED_CLOSE_BUTTONS,
    ].sort();
    // A dialog that is neither audited nor deferred has to be named here first,
    // which is the whole point: the deferred paths are a debt with an owner,
    // not a blind spot. The key is the literal label, and that is the limit of the
    // claim — measured at this commit, three dialogs close with a *button* under some
    // other aria-label and so belong to no list here: notifications-drawer.tsx
    // ("Close notifications", `p-2` around a 20px glyph = 36px), receipt-viewer.tsx
    // ("Close receipt viewer", `p-1` = 28px) and home/announcement-detail-modal.tsx
    // ("Close modal", which carries its own min-h/min-w and clears the floor by accident).
    // Deleting those tokens from the third would RED nothing, because a guard cannot
    // measure a control it was told to look for under a different name.
    assert.deepEqual(
      found,
      expected,
      `the app's close-button inventory moved (found ${found.length}, expected ${expected.length}): ${found
        .filter((path) => !expected.includes(path))
        .concat(expected.filter((path) => !found.includes(path)))
        .join(" ")}`,
    );
  });

  it("gives the element that wraps each money-entry form a scroll region", () => {
    // Round 1 matched the scroll classes anywhere in the file, so it was
    // placement-blind. Round 2 fixed that by naming "the last `<div>` before the
    // form", which is placement-exact but the wrong *role*: that is the
    // innermost wrapper, so an innocuous `<div className="space-y-4">` added
    // between the body and the form failed the suite while the modal was still
    // correct. This version identifies each element by what it does.
    for (const host of modalHosts) {
      const divs = [...host.source.matchAll(/<div className="([^"]*)"/g)];
      // A host whose scroll region is built dynamically cannot be read from
      // source text at all, and the honest failure is to say so rather than to
      // fall back on the header row and pass.
      assert.ok(
        divs.length > 0,
        `${host.name}: no literal <div className> found — this pin reads literal class strings`,
      );
      const panels = divs.filter((m) => m[1].includes("rounded-2xl"));
      assert.equal(
        panels.length,
        1,
        `${host.name}: exactly one panel element, got ${panels.length}`,
      );
      const bodies = divs.filter((m) => m[1].includes("overflow-y-auto"));
      assert.equal(
        bodies.length,
        1,
        `${host.name}: exactly one literal div may scroll; 0 means the scroll region is no longer a literal className, >1 means two regions compete`,
      );
      const headers = divs.filter((m) => m[1].includes("p-5 border-b"));
      assert.equal(headers.length, 1, `${host.name}: exactly one header row`);
      // The panel is the element that must fit the viewport, and the body is the
      // element that absorbs whatever the header does not use. Capping the
      // *body* instead was the round-2 defect: `panel = header + cap`, and the
      // 81px header this file was pinned against is only 81px while the title
      // and subtitle stay on one line. At a 360px viewport the panel is 328px
      // wide, the header's own padding/icon/close button leave the text column
      // ~190px, and a 22-33 character `text-base font-extrabold` title wraps to
      // two 24px lines over a 12px subtitle that wraps to two or three — a
      // 121-137px header, which put the panel 33-49px past the backdrop box and
      // re-clipped the submit row exactly as `75vh` had. Subtracting the
      // backdrop's own padding (`p-4` = 2rem) instead leaves nothing to guess
      // about, because the body's `flex-1 min-h-0` gives it the remainder
      // whatever the header's height turns out to be.
      assert.match(
        panels[0][1],
        /max-h-\[calc\(100dvh-2rem\)\]/,
        `${host.name}: the panel must be capped against the viewport`,
      );
      assert.match(
        panels[0][1],
        /flex flex-col/,
        `${host.name}: a capped panel must be a column or the body cannot absorb the remainder`,
      );
      assert.match(
        panels[0][1],
        /overflow-hidden/,
        `${host.name}: the panel's clip is why an uncapped body overflows invisibly`,
      );
      assert.match(
        bodies[0][1],
        /flex-1/,
        `${host.name}: the scroll region must take the space left by the header`,
      );
      assert.match(
        bodies[0][1],
        /min-h-0/,
        `${host.name}: without min-h-0 a flex child refuses to shrink below its content and the scroll region never forms`,
      );
      // The body's padding is part of the remedy, not incidental to it: the
      // round-3 review found the pin passing with `p-6` deleted, which ships an
      // unstyled form flush against the panel edge.
      assert.match(
        bodies[0][1],
        /p-6/,
        `${host.name}: the scroll region keeps its inset padding while it scrolls`,
      );
      // And the lesson of N-1 in one line: the viewport constant belongs on the
      // panel. A second `max-h-` here would compete with it, and substring
      // matching on the identifiers above would not notice.
      assert.doesNotMatch(
        bodies[0][1],
        /max-h-/,
        `${host.name}: the body must carry no viewport cap — that is the defect this replaced`,
      );
      // Containment, measured rather than implied by file order: the panel must
      // still be open when the body opens. Comparing the two `index` values only
      // proves the panel's tag comes first, so re-parenting the body out of the
      // panel — the exact structural claim this pin exists to hold — stays green.
      const between = host.source.slice(panels[0].index, bodies[0].index);
      const openDivs = (between.match(/<div\b/g) ?? []).length;
      const closeDivs = (between.match(/<\/div>/g) ?? []).length;
      assert.ok(
        openDivs - closeDivs >= 1,
        `${host.name}: the scroll region is not inside the capped panel (${openDivs} <div> opens vs ${closeDivs} closes between them)`,
      );
      assert.ok(
        headers[0].index < bodies[0].index,
        `${host.name}: the header must precede the scroll region, not be it`,
      );
      assert.match(
        headers[0][1],
        /shrink-0/,
        `${host.name}: a wrapped header must not be squeezed by the body`,
      );
      // Neither superseded cap may creep back, in a literal or inside a
      // `cn(...)` call — counted across the whole file, not per div.
      assert.doesNotMatch(
        host.source,
        /max-h-\[(75vh|calc\(100dvh-7\.5rem\)\])/,
        `${host.name}: both superseded caps resolve against a viewport or a header height this file does not control`,
      );
      assert.equal(
        (host.source.match(/overflow-y-auto/g) ?? []).length,
        1,
        `${host.name}: a second scroll region anywhere in the file, dynamic or not`,
      );
      // The hosts are named for the forms they render; if that link is renamed,
      // this pin is measuring the wrong file and must say so.
      assert.equal(
        [
          ...host.source.matchAll(
            /<(?:ClubIncomeForm|ClubExpenseForm|FinanceVoidForm|FinanceCorrectionForm)\b/g,
          ),
        ].length,
        1,
        `${host.name} must render exactly one migrated money-entry form`,
      );
    }
    assert.equal(
      modalHosts.length,
      4,
      "all four money-entry hosts must be measured",
    );
  });

  it("runs the Pay Dues receipt field through the shared primitive", () => {
    // A text field in the most-used phone dues path, now on the shared
    // primitive. It was *not* the last sub-floor control here, which is what
    // this comment used to claim: the sweep above is what makes that claim
    // checkable, and it found six more in this file (close X, Select All,
    // Clear, the month picker label, Copy Account, the notes textarea).
    assert.match(payDues, /<CfTextField/);
    assert.match(payDues, /id="dues-receipt-file"/);
    // Its hand-rolled label is gone: the primitive owns that association now.
    assert.doesNotMatch(payDues, /htmlFor="dues-receipt-file"/);
    // DESIGN.md's target floor: "never fall below" 44px. The two raw buttons
    // here (the admin "Understood" and the dues Cancel in the pinned footer)
    // were `min-h-[40px]`; the pinned footer's `FormSubmitButton` also carried a
    // redundant `min-h-[40px]` beside the `h-12` it already gets from its
    // default size, which is the second-owner trap Task 3 logged.
    assert.doesNotMatch(payDues, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/);
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
    // ...and the rename-resistant form of the check above: `FormFieldError` is
    // only a component *name*, so the same duplication wrapped in a locally
    // renamed component would sail straight past it. The structural tell of a
    // hand-wired second error paragraph is the `message={fieldErrors.X}` prop the
    // sibling takes, so pin that too — `message=` appears zero times in this file
    // today.
    assert.doesNotMatch(forms, /message=\{fieldErrors/);
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
    // Reading note, because "2" here is easy to misread: this counts the
    // caller-owned `aria-describedby` wirings, not the `CONTROL` consumers.
    // Three `FormattedAmountInput` sites take `CONTROL` in this file
    // (`:133`, `:340`, `:653`); only the income and expense amounts have a
    // server-error path, so `correct-amount` is handed no `error=`/`errorId=`
    // and wires nothing today.
  });

  it("keeps every migrated control block's field wiring intact", () => {
    // plan:627 wrote these regressions off as "properties of a 22-control
    // migration that no source-text test can assert". They are not: a primitive
    // block is one contiguous attribute list — plus, for `CfFieldLayout`, the
    // single control it wraps — so everything a migration can silently drop is
    // readable from the source text. Measured against this file at this commit:
    // 23 blocks, 0 failures. Rules, and why each is shaped the way it is:
    //  (a) key agreement — a block that renders `error={fieldErrors.X}` must
    //     clear `X` from its own `onChange`; a clear pointed at another key
    //     leaves the paragraph in the DOM while the user types;
    //  (b) every block must name the field it submits — `name` is the only thing
    //     that puts the value into the server action's FormData. The "id-only
    //     search box" exception is encoded as an explicitly EMPTY list, because
    //     measured here all 23 blocks do have a name (the three `CfFieldLayout`
    //     shells take theirs from the `FormattedAmountInput` they wrap) and a
    //     wildcard carve-out would excuse a dropped `name` just as readily as a
    //     genuine search box would justify one;
    //  (c) every literal `id=` is unique — duplicate ids make the first match the
    //     only node reachable by `htmlFor`, `aria-describedby` or a URL hash
    //     anchor. Dynamic `id={`…${category.id}`}` ids cannot be compared from
    //     source text and are not claimed here;
    //  (d) the `required` inventory, for the reason stated at its definition.
    const blocks = [
      ...forms.matchAll(/<(CfTextField|CfSelect|CfFieldLayout)\b/g),
    ].map((open) => {
      const tag = open[1];
      const rest = forms.slice(open.index + tag.length + 1);
      const close = rest.indexOf(`</${tag}>`);
      const nextOpen = rest.search(new RegExp(`<${tag}\\b`));
      const container = close !== -1 && (nextOpen === -1 || close < nextOpen);
      const text = container
        ? rest.slice(0, close + tag.length + 3)
        : rest.slice(0, rest.indexOf("/>") + 2);
      return { tag, text, container };
    });
    // The same length guard the button-floor fix rests on: without it, one
    // renamed primitive or one reformat returns `[]` and every loop below is
    // inert while the suite stays green.
    assert.equal(blocks.length, 23, "every primitive block must be measured");
    // Truncation detector, stated as an invariant rather than a promise about the
    // regex. A lazy `(?:\/>|<\/(?:…)>)` alternation — what this block used to do
    // — stops a `CfFieldLayout` at its wrapped control's `/>` and drops the tail.
    // That was inert at the commit it shipped (the dropped text was two closing
    // tags) and would have propagated to Task 5's and Task 6's copies of this pin
    // as a silent narrowing of what rules (a)-(d) actually inspect.
    for (const block of blocks) {
      assert.ok(
        block.container
          ? block.text.endsWith(`</${block.tag}>`)
          : block.text.endsWith("/>"),
        `${block.tag} block was not captured through its own terminator`,
      );
      // The premise that makes "the next `</tag>` is mine" sound: none of these
      // primitives nests inside another. If that ever changes, this fails before
      // the rules below start reading someone else's attributes.
      assert.equal(
        block.text.indexOf(`<${block.tag}`, 1),
        -1,
        `${block.tag} nests inside another ${block.tag} block`,
      );
    }
    assert.equal(
      blocks.filter((block) => block.tag === "CfFieldLayout").length,
      3,
      "the three caller-owned money shells must be measured",
    );

    // Blocks carrying the HTML `required` attribute, measured at this commit.
    // Deliberately a list and not a derivation: `label="… *"` is *not* a proxy
    // for it. Measured here, 21 blocks show a `*` and only 10 carry the
    // attribute, so the two disagree on 11 blocks — `receipt_file` is mandatory
    // only under the transfer channel, the amount fields and `expense-category`
    // are validated by the server action on the income/expense forms while the
    // correction form's copies do carry the attribute, and a `*` on a control
    // that must stay submittable while empty is a contract this file already
    // ships. A requiredness change is a deliberate edit that has to say so in
    // this list; a requiredness *drop* is the silent regression that catches.
    const REQUIRED_IDS = [
      "correct-amount",
      "correct-cat",
      "correct-date",
      "correct-desc",
      "correct-payee",
      "correct-reason",
      "correct-source",
      "expense-date",
      "income-date",
      "void-reason",
    ];
    // Rule (b)'s exception list, empty by measurement. Add an id here only with
    // a reason as good as the one the id would have to give.
    const NAMELESS_BLOCKS = new Set();

    const submittedNames = new Set(
      [...forms.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1]),
    );
    const blockIds = [];
    const requiredSeen = [];
    for (const { tag, text: body } of blocks) {
      const id = (body.match(/\bid="([^"]+)"/) ?? [])[1];
      assert.ok(
        id,
        `${tag} block must keep a stable DOM id; the M-1 rename list is tracked against these`,
      );
      blockIds.push(id);
      const where = `${tag}#${id}`;

      const name = (body.match(/\bname="([^"]+)"/) ?? [])[1];
      if (!name) {
        assert.ok(
          NAMELESS_BLOCKS.has(id),
          `${where}: no name attribute — this field never reaches the server action`,
        );
      }

      const errorKey = (body.match(/error=\{fieldErrors\.(\w+)\}/) ?? [])[1];
      const clearKey = (body.match(/clearFieldError\("(\w+)"\)/) ?? [])[1];
      if (errorKey) {
        assert.equal(
          clearKey,
          errorKey,
          `${where}: its onChange must clear the same key it renders an error for`,
        );
      }
      if (clearKey) {
        assert.ok(
          submittedNames.has(clearKey),
          `${where}: clearFieldError("${clearKey}") names a field this file never submits`,
        );
      }
      if (/\brequired\b/.test(body)) requiredSeen.push(id);
    }

    assert.deepEqual(
      requiredSeen.slice().sort(),
      REQUIRED_IDS.slice().sort(),
      "the required/optional split moved without the inventory above moving with it",
    );

    assert.equal(
      new Set(blockIds).size,
      blockIds.length,
      `duplicate DOM ids among the migrated blocks: ${blockIds.filter(
        (value, index) => blockIds.indexOf(value) !== index,
      )}`,
    );
    const literalIds = [...forms.matchAll(/\bid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(
      new Set(literalIds).size,
      literalIds.length,
      `duplicate DOM ids in finance-forms.tsx: ${literalIds.filter(
        (value, index) => literalIds.indexOf(value) !== index,
      )}`,
    );
  });
});
