import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/email/format-schedule.ts", import.meta.url),
  "utf8",
);
const notificationsSource = await readFile(
  new URL("../src/lib/email/notifications.ts", import.meta.url),
  "utf8",
);
const actionsSource = await readFile(
  new URL("../src/app/actions.ts", import.meta.url),
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

    assert.equal(
      formatSchedule(date, "Africa/Lagos").endsWith(` ${label}`),
      true,
    );
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

  it("renders the email clock in 12-hour form with an uppercase meridiem", () => {
    assert.equal(
      formatSchedule("2026-11-12T17:00:00.000Z", "Africa/Lagos"),
      "12 Nov 2026, 6:00 PM WAT",
    );
    assert.equal(
      formatSchedule("2026-11-12T23:30:00.000Z", "Africa/Lagos"),
      "13 Nov 2026, 12:30 AM WAT",
    );
    assert.equal(
      formatSchedule("2026-11-12T12:00:00.000Z", "Africa/Lagos"),
      "12 Nov 2026, 1:00 PM WAT",
    );
  });

  it("never prints a 24-hour hour or a narrow no-break space", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const iso = `2026-06-15T${String(hour).padStart(2, "0")}:15:00.000Z`;
      const formatted = formatSchedule(iso, "Africa/Lagos");
      assert.match(formatted, / (1[0-2]|[1-9]):\d\d (AM|PM) WAT$/, iso);
      assert.equal(formatted.includes(String.fromCharCode(0x202f)), false, iso);
    }
  });

  it("uses each event's timezone for cancellation and role-assignment dates", () => {
    assert.match(
      notificationsSource,
      /Original Date[\s\S]{0,120}formatSchedule\(\s*params\.startsAt,\s*params\.timezone \?\? "Africa\/Lagos",?\s*\)/,
    );
    assert.match(
      notificationsSource,
      /\.select\("title, starts_at, location, timezone"\)[\s\S]{0,500}formatSchedule\(\s*eventRow\.starts_at,\s*eventRow\.timezone \?\? "Africa\/Lagos",?\s*\)/,
    );
    assert.match(
      actionsSource,
      /notifyEventCancelled\(\{[\s\S]{0,250}timezone: beforeRow\.timezone/,
    );
  });
});
