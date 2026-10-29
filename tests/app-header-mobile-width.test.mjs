import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const header = readFileSync(
  new URL("../src/components/app-header.tsx", import.meta.url),
  "utf8",
);

describe("mobile app header width", () => {
  it("hides the visual brand name where the menu and account controls need room", () => {
    const brand =
      /<span className="([^"]*)">\s*\{clubBrand\.shortName\}\s*<\/span>/.exec(
        header,
      );
    assert.ok(brand, "could not find the mobile brand name");
    assert.match(
      brand[1],
      /(?:^|\s)hidden(?:\s|$)/,
      "the brand label takes horizontal space on narrow phones",
    );
    assert.match(
      brand[1],
      /(?:^|\s)min-\[24rem\]:inline(?:\s|$)/,
      "the brand label should return once the header has 24rem of space",
    );
  });

  it("keeps an accessible name on the home link when the visual label is hidden", () => {
    assert.match(
      header,
      /aria-label=\{`\$\{clubBrand\.shortName\} home`\}[\s\S]*?href="\/"/,
      "the logo-only home link must keep a descriptive accessible name",
    );
  });
});
