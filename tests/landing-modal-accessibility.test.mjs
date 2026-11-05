import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The landing page is the one surface a stranger judges the club by, so the
// drawer and the three modals have to behave like the dialogs they claim to be:
// nothing focusable may hide off-screen, focus must land inside and come back
// out, and every field must stay labelled once its placeholder disappears.
const MODALS = [
  "src/components/landing/membership-intake-modal.tsx",
  "src/components/landing/partnership-enquiry-modal.tsx",
  "src/components/landing/constitution-modal.tsx",
];
const SHELL = "src/components/landing/modal-shell.tsx";
const NAV = "src/components/landing/landing-nav.tsx";
const CSS = "src/app/globals.css";

const read = (file) => readFileSync(file, "utf8");

/** Opening tag of an element, so attributes can be inspected as a unit. */
function openingTag(src, tag, idOrClass) {
  const pattern = new RegExp(
    `<${tag}\\b[^>]*${idOrClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`,
  );
  return pattern.exec(src)?.[0] ?? "";
}

function fieldIds(src) {
  const ids = new Set();
  for (const [, attrs] of src.matchAll(
    /<(?:input|select|textarea)\b([^>]*?)>/g,
  )) {
    const id = /id="([^"]+)"/.exec(attrs);
    if (id) ids.add(id[1]);
  }
  return ids;
}

function labelledTargets(src) {
  return new Set([...src.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]));
}

test("the closed mobile drawer is dropped from the tab order", () => {
  const nav = read(NAV);
  const drawer = openingTag(nav, "aside", 'id="drawer"');
  assert.match(
    drawer,
    /\binert=\{[^}]*mobileMenuOpen[^}]*\}/,
    "The off-screen drawer still holds focusable links; make it inert while closed.",
  );
  assert.match(
    drawer,
    /aria-hidden=\{[^}]*mobileMenuOpen[^}]*\}/,
    "The off-screen drawer must also leave the accessibility tree while closed.",
  );
});

test("all three landing modals share one shell", () => {
  for (const file of MODALS) {
    const src = read(file);
    assert.match(
      src,
      /from "\.\/modal-shell"/,
      `${file} must render through the shared ModalShell`,
    );
    assert.doesNotMatch(
      src,
      /role="dialog"/,
      `${file} rolls its own dialog; the shell owns that job.`,
    );
  }
});

test("the modal shell moves focus in, traps Tab, and restores focus out", () => {
  const shell = read(SHELL);
  assert.match(shell, /\.focus\(\)/, "Nothing focuses the dialog on open.");
  assert.match(
    shell,
    /Tab/,
    "Tab must stay inside the dialog while it is open.",
  );
  assert.match(
    shell,
    /document\.activeElement/,
    "The previously focused control must be remembered so focus can return to it.",
  );
  assert.match(
    shell,
    /style\.overflow\s*=\s*"hidden"[\s\S]*style\.overflow\s*=/,
    "Body scroll must lock while a dialog is open and unlock on close.",
  );
});

test("modal fields keep a visible label after the placeholder vanishes", () => {
  for (const file of MODALS) {
    const src = read(file);
    const unlabeled = [...fieldIds(src)].filter(
      (id) => !labelledTargets(src).has(id),
    );
    assert.deepEqual(
      unlabeled,
      [],
      `${file} fields have no label at all: ${unlabeled.join(", ")}`,
    );
    assert.doesNotMatch(
      src,
      /className="sr-only"/,
      `${file} still hides its labels from sighted users.`,
    );
  }
});

test("modal submit buttons wait for the server action", () => {
  const shell = read(SHELL);
  assert.match(
    shell,
    /useFormStatus/,
    "No pending state available to the form.",
  );
  assert.match(
    shell,
    /disabled=\{/,
    "The submit control must lock while pending.",
  );
  const doubleFirable = MODALS.filter((file) => {
    const src = read(file);
    return /type="submit"/.test(src) && !/ModalSubmit/.test(src);
  });
  assert.deepEqual(
    doubleFirable,
    [],
    "Forms with a plain type=submit button can be fired twice.",
  );
});

test("landing modals carry no dead animation classes or undersized close controls", () => {
  for (const file of [SHELL, ...MODALS]) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /animate-in|zoom-in-95/,
      `${file} keeps tailwindcss-animate classes that this build never compiles.`,
    );
    assert.doesNotMatch(
      src,
      /h-8 w-8/,
      `${file} has a 32px close control; the touch floor is 44px.`,
    );
  }
});

test("anchor jumps land below the sticky header", () => {
  const css = read(CSS);
  const pad = /scroll-padding-top:\s*(\d+)px/.exec(css);
  assert.ok(
    pad,
    "No scroll-padding-top: #about and #events scroll under the sticky nav.",
  );
  assert.ok(
    Number.parseInt(pad[1], 10) >= 72,
    `scroll-padding-top is ${pad[1]}px; the header is 72px tall.`,
  );
});
