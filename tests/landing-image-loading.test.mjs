import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// The landing page ships seven photographs. Only the hero is worth starting
// before first paint; the rest compete with it for the same bandwidth.
const files = [
  "src/app/page.tsx",
  ...readdirSync("src/components/landing")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `src/components/landing/${f}`),
];

function imgBlocks(src) {
  return [...src.matchAll(/<img\b([\s\S]*?)\/>/g)].map((m) => m[1]);
}

const srcOf = (attrs) => /src="([^"]+)"/.exec(attrs)?.[1] ?? "";

test("every landing photograph is described and deferred or prioritised", () => {
  const offenders = [];
  let heroes = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const attrs of imgBlocks(src)) {
      const path = srcOf(attrs);
      if (!path) continue;
      if (!/\balt="[^"]+"/.test(attrs))
        offenders.push(`${file}: ${path} has no alt`);
      if (path === "/landing/hero-family.jpg") {
        heroes += 1;
        if (!/fetchPriority="high"/.test(attrs)) {
          offenders.push(
            `${file}: ${path} is the LCP image but is not marked high`,
          );
        }
        if (/loading="lazy"/.test(attrs)) {
          offenders.push(
            `${file}: ${path} is the hero; lazy-loading it delays first paint`,
          );
        }
      } else {
        if (!/loading="lazy"/.test(attrs)) {
          offenders.push(`${file}: ${path} downloads before it can be seen`);
        }
        if (!/decoding="async"/.test(attrs)) {
          offenders.push(`${file}: ${path} decodes on the main thread`);
        }
      }
    }
  }
  assert.equal(heroes, 1, "exactly one hero photograph is expected");
  assert.deepEqual(
    offenders,
    [],
    `landing imagery:\n    ${offenders.join("\n    ")}`,
  );
});
