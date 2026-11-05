import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("landing page and components contain zero occurrences of 60% profit sharing", () => {
  const files = [
    "src/app/page.tsx",
    "src/components/landing/landing-hero.tsx",
    "src/components/landing/landing-what-we-do.tsx",
    "src/components/landing/constitution-modal.tsx"
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /60%\s*\/\s*40%/, `Found profit sharing in ${f}`);
    assert.doesNotMatch(text, /60%\s*of\s*event\s*profits/i, `Found profit sharing in ${f}`);
  }
});

test("portal page handles all auth states and notices", () => {
  const portalText = fs.readFileSync("src/app/portal/page.tsx", "utf8");
  assert.match(portalText, /AuthPageLayout/);
  assert.match(portalText, /HomeDashboardView/);
});
