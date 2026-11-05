import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

// Owner ruling, 2026-11-05. The club's own words for itself:
//   • "Assembly" -> "Meeting"
//   • "Beverage" -> "Drinks" (the club promotes liquor, wine and everything else
//     that is poured, alcoholic or not — "beverage" reads like a supplier category)
//   • "Gathering" -> "Event", or "Family" when the sentence means the people
//   • "RSVP" -> "Tickets / Reservations"
// Scoped to the whole source tree rather than a file list, so a component added
// next month cannot quietly revive the old vocabulary.
const BANNED = {
  assembly: "say Meeting",
  beverage: "say Drinks",
  gathering: "say Event, or Family when you mean the people",
  rsvp: "say Tickets / Reservations",
};

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const files = sourceFiles("src");

for (const [word, rule] of Object.entries(BANNED)) {
  test(`no source file says "${word}" — ${rule}`, () => {
    const offenders = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (new RegExp(word, "i").test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
      });
    }
    assert.deepEqual(offenders, [], `${word} is retired vocabulary`);
  });
}

test("the retired-word scan really reads the whole tree", () => {
  assert.ok(
    files.length > 200 && files.includes("src/app/page.tsx"),
    `expected the full src tree, saw ${files.length} files`,
  );
  assert.ok(statSync("src/app/page.tsx").isFile());
});
