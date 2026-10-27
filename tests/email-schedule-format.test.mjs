import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/email/format-schedule.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { formatSchedule } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function timeZoneLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
}

describe("email schedule timezone labels", () => {
  it("uses the configured timezone label for Lagos schedules", () => {
    const date = "2026-01-15T12:00:00.000Z";
    const label = timeZoneLabel(new Date(date), "Africa/Lagos");

    assert.equal(formatSchedule(date, "Africa/Lagos").endsWith(` ${label}`), true);
  });

  it("uses the configured timezone label instead of always saying WAT", () => {
    const date = "2026-01-15T12:00:00.000Z";
    const timeZone = "America/Los_Angeles";
    const label = timeZoneLabel(new Date(date), timeZone);
    const formatted = formatSchedule(date, timeZone);

    assert.equal(formatted.endsWith(` ${label}`), true);
    assert.equal(formatted.endsWith(" WAT"), false);
  });

  it("keeps the original input when the date or timezone is invalid", () => {
    assert.equal(formatSchedule("not-a-date", "Africa/Lagos"), "not-a-date");
    assert.equal(
      formatSchedule("2026-01-15T12:00:00.000Z", "Not/A_Timezone"),
      "2026-01-15T12:00:00.000Z",
    );
  });
});
