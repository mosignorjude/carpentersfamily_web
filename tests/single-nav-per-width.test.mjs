import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// SRC_ROOT lets the controller run this exact file against pre/post fixtures.
const ROOT = process.env.SRC_ROOT
  ? process.env.SRC_ROOT
  : fileURLToPath(new URL("..", import.meta.url));

const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const header = readFileSync(
  join(ROOT, "src/components/app-header.tsx"),
  "utf8",
);
const menu = readFileSync(
  join(ROOT, "src/components/mobile-app-menu.tsx"),
  "utf8",
);
const shell = readFileSync(join(ROOT, "src/components/app-shell.tsx"), "utf8");

const DISPLAY_TOKENS = new Set([
  "block",
  "contents",
  "flex",
  "grid",
  "hidden",
  "inline-block",
  "inline-flex",
]);

/** Top-level @media blocks, found by brace counting so nesting cannot truncate them. */
function mediaBlocks(source) {
  const out = [];
  const opener = /@media([^{]*)\{/g;
  let match = opener.exec(source);
  while (match !== null) {
    const bodyStart = opener.lastIndex;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    out.push({
      query: match[1].trim(),
      body: source.slice(bodyStart, i - 1),
      start: match.index,
      end: i,
    });
    opener.lastIndex = i;
    match = opener.exec(source);
  }
  return out;
}

const BLOCKS = mediaBlocks(css);
/** A block hides the sidebar if either shell's display is switched off in it. */
const hidesSidebar = (body) =>
  /\.app-sidebar\s*\{[^}]*display:\s*none\b/.test(body) ||
  /\.app-shell-dashboard \.app-sidebar\s*\{[^}]*display:\s*none\b/.test(body);
const showsNavGroup = (body) =>
  /\.app-mobile-nav\s*\{[^}]*display:\s*flex\b/.test(body);
const baseDisplayOf = (cls) =>
  cls
    .split(/\s+/)
    .filter((t) => t !== "" && !t.includes(":") && DISPLAY_TOKENS.has(t));
// Token equality, never a word-boundary grep: /\bapp-mobile-nav\b also matches the
// non-existent class "app-mobile-nav--legacy", which would hide nothing.
const hasGate = (cls) => cls.split(/\s+/).includes("app-mobile-nav");
// Any conditional `hidden`, whatever the variant is spelled as. The earlier shape
// here accepted a fixed sm|md|lg|xl list, which is the exact hole the Task 5
// review caught: 2xl and arbitrary variants like min-[400px] hid an element from
// the pin entirely.
const breakpointHidden = (cls) =>
  cls.split(/\s+/).some((token) => {
    const parts = token.split(":");
    return parts.length > 1 && parts.at(-1) === "hidden";
  });
// A `max-` only counts inside a variant segment: `max-w-full` is a sizing utility,
// and reading it as a media variant would RED an innocent class.
const maxVariant = (cls) =>
  cls.split(/\s+/).some((token) =>
    token
      .split(":")
      .slice(0, -1)
      .some((variant) => variant.startsWith("max-")),
  );

describe("exactly one primary navigation at every width", () => {
  it("couples the hamburger to the breakpoint that actually hides the sidebar", () => {
    const navBlocks = BLOCKS.filter((b) => hidesSidebar(b.body));
    assert.ok(
      navBlocks.length >= 1,
      "no @media block hides .app-sidebar — the mobile layout switch has been deleted",
    );
    for (const block of navBlocks) {
      assert.match(
        block.query,
        /max-width:\s*56rem/,
        `.app-sidebar is hidden at "${block.query}"; the nav switch must stay at 56rem`,
      );
      assert.ok(
        showsNavGroup(block.body),
        `the sidebar hides at "${block.query}" but nothing shows the mobile nav there`,
      );
    }
  });

  it("defaults the mobile nav group to hidden outside its breakpoint", () => {
    // Top-level (column 0) rule only: an indented rule lives inside a media block.
    let outside = "";
    let cursor = 0;
    for (const block of BLOCKS) {
      outside += css.slice(cursor, block.start);
      cursor = block.end;
    }
    outside += css.slice(cursor);
    const rule = outside.match(/^\.app-mobile-nav\s*\{([^}]*)\}/m);
    assert.ok(
      rule,
      ".app-mobile-nav has no top-level rule; the nav group must default to display:none",
    );
    assert.match(
      rule[1],
      /display:\s*none/,
      ".app-mobile-nav must hide by default",
    );

    // Cascade, which no source-text test can see unless someone does the arithmetic:
    // `.app-mobile-nav { display: none }` and the in-block `display: flex` have the
    // same specificity, so the one that appears LAST in the file wins inside the
    // media range. Moving the unconditional default below the block therefore blanks
    // mobile navigation at every width while every other assertion here stays green.
    const showingBlocks = BLOCKS.filter((b) => showsNavGroup(b.body));
    assert.equal(
      showingBlocks.length,
      1,
      `${showingBlocks.length} @media blocks set .app-mobile-nav to display:flex; exactly one may, ` +
        "or two ranges fight and the later one in the file decides",
    );
    const defaultAt = css.search(/^\.app-mobile-nav\s*\{/m);
    assert.ok(
      defaultAt !== -1 && defaultAt < showingBlocks[0].start,
      `the top-level .app-mobile-nav default sits at offset ${defaultAt} and the block that re-shows it at ` +
        `${showingBlocks[0].start}: equal specificity means the later rule wins, so the default must precede the block ` +
        "or the hamburger and mobile brand disappear on phones",
    );
  });

  it("gates both mobile-only header elements by the shared class, not by a utility", () => {
    const toggleHost = header.match(
      /<div className="([^"]*)">\s*<MobileAppMenu/,
    );
    assert.ok(toggleHost, "cannot find the <div> that wraps <MobileAppMenu>");
    const brand = [...header.matchAll(/<Link\b([^>]*)>/g)].find((m) =>
      m[1].includes('href="/"'),
    );
    assert.ok(brand, 'cannot find the <Link href="/"> in app-header.tsx');
    const brandClass = brand[1].match(/className="([^"]*)"/);
    assert.ok(
      brandClass,
      "the mobile brand <Link> has no static className to pin",
    );

    for (const [name, cls] of [
      ["menu toggle host", toggleHost[1]],
      ["mobile brand link", brandClass[1]],
    ]) {
      assert.ok(
        hasGate(cls),
        `${name} is not gated by the .app-mobile-nav class`,
      );
      assert.deepEqual(
        baseDisplayOf(cls),
        [],
        `${name} carries base display utilities (${baseDisplayOf(cls)}); display is owned by .app-mobile-nav`,
      );
      assert.ok(
        !breakpointHidden(cls),
        `${name} still hides itself at a Tailwind breakpoint`,
      );
      assert.ok(
        !maxVariant(cls),
        `${name} uses a max-* variant instead of the shared class`,
      );
    }

    // The gate hides whatever carries it above the nav breakpoint, so a stray third
    // use can blank a whole region. Pin its cardinality, not only its presence.
    const uses = (source) =>
      (source.match(/app-mobile-nav(?![\w-])/g) ?? []).length;
    assert.equal(
      uses(header),
      2,
      `only the toggle host and the brand link may carry the gate (found ${uses(header)})`,
    );
    assert.equal(
      uses(menu),
      0,
      "the menu panel is inside the gated host; it must not gate itself",
    );
    assert.equal(
      uses(shell),
      0,
      "the app shell must not carry the mobile nav gate",
    );
  });

  it("lets the overlay scrim inherit the gate from its ancestor", () => {
    const scrim = menu.match(
      /<div\b([^>]*?)onClick=\{\(\) => setIsOpen\(false\)\}/,
    );
    assert.ok(scrim, "cannot find the scrim <div> in mobile-app-menu.tsx");
    const cls = scrim[1].match(/className="([^"]*)"/);
    assert.ok(cls, "the scrim has no static className to pin");
    // Token membership, not the "fixed inset-0 z-70" substring: a reorder of the
    // scrim's classes changes nothing about the overlay but breaks a conjunction grep.
    for (const token of ["fixed", "inset-0", "z-70"]) {
      assert.ok(cls[1].split(/\s+/).includes(token), `the scrim lost ${token}`);
    }
    assert.ok(
      !breakpointHidden(cls[1]),
      "the scrim still carries a breakpoint utility",
    );
    assert.deepEqual(
      baseDisplayOf(cls[1]),
      [],
      "the scrim sets its own display",
    );
  });

  it("keeps the live shell rules that sit beside the dead ones", () => {
    const shell_block = BLOCKS.find((b) => /\.app-shell\s*\{/.test(b.body));
    assert.ok(
      shell_block,
      ".app-shell { display: block } has been deleted from the 56rem block",
    );
    assert.match(shell_block.body, /\.app-shell\s*\{[^}]*display:\s*block/);
    assert.match(shell_block.body, /\.app-sidebar\s*\{[^}]*display:\s*none/);
    assert.ok(
      BLOCKS.filter((b) => hidesSidebar(b.body)).length === 1,
      "more than one @media block hides the sidebar; the nav switch must live in a single block",
    );
    // Safe only because nothing sets display on the dashboard variant: the general
    // .app-sidebar rule then hides both shells. If a display ever returns there,
    // the dashboard keeps a hidden sidebar while the hamburger gate says desktop.
    assert.doesNotMatch(
      css,
      /\.app-shell-dashboard \.app-sidebar\s*\{[^}]*\bdisplay:/,
      ".app-shell-dashboard .app-sidebar sets display; it needs its own nav breakpoint block",
    );
  });

  it("drops the never-used mobile header rules and keeps the live brand rules", () => {
    assert.doesNotMatch(
      css,
      /\.app-mobile-header/,
      ".app-mobile-header rules are still present",
    );
    assert.doesNotMatch(
      css,
      /\.app-mobile-actions/,
      ".app-mobile-actions rules are still present",
    );
    for (const live of [
      ".app-brand",
      ".app-brand-copy",
      ".app-brand-name",
      ".app-brand-slogan",
      ".app-brand-logo",
      ".app-signout-form",
      ".app-menu-toggle",
      ".app-menu-icon",
      ".app-mobile-menu",
      ".app-mobile-menu-panel",
    ]) {
      assert.ok(
        new RegExp(`^${live.split(".").join("\\.")}\\s*\\{`, "m").test(css),
        `the live rule ${live} was deleted along with the dead ones`,
      );
    }
  });
});
