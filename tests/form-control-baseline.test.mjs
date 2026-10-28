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
    const sizes =
      button.match(/\b(default|compact|large|icon):\s*"([^"]+)"/g) ?? [];
    assert.equal(sizes.length, 4, "every CfButton size must be measured");
    for (const size of sizes) {
      assert.match(size, /h-11|h-12/, `below the 44px floor: ${size}`);
    }
    assert.match(button, /icon:\s*"[^"]*h-11[^"]*w-11/);
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
    // The last sub-floor money-entry control in the most-used phone dues path.
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
