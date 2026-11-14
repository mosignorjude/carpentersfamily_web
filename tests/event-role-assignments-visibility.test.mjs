import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Issue 04: assigned event members visibility & query error handling", () => {
  it("grants SELECT on event_role_assignments.id to authenticated so staffing queries never fail with 42501", async () => {
    const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const contents = await Promise.all(
      files.map((file) => readFile(new URL(file, migrationsDir), "utf8")),
    );
    const combinedSql = contents.join("\n");

    const grantsId =
      /grant\s+select\s*\([^)]*\bid\b[^)]*\)\s+on\s+(?:table\s+)?public\.event_role_assignments\s+to\s+authenticated/i.test(
        combinedSql,
      );

    assert.equal(
      grantsId,
      true,
      "authenticated must have SELECT privilege on public.event_role_assignments(id)",
    );

    const pgTap = await readFile(
      new URL(
        "../supabase/tests/database/events_roles_budgets_lifecycle_test.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      pgTap,
      /has_column_privilege\(\s*'authenticated'\s*,\s*'public\.event_role_assignments'\s*,\s*'id'\s*,\s*'SELECT'\s*\)/i,
      "pgTAP suite must verify SELECT privilege on event_role_assignments.id",
    );
  });

  it("checks event_role_assignments query errors instead of silently returning empty lists", async () => {
    const dashboardPage = await readFile(
      new URL(
        "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      dashboardPage,
      /teamResult\.error/,
      "event dashboard SSR must inspect teamResult.error instead of coercing data ?? []",
    );

    const eventsPage = await readFile(
      new URL("../src/app/(member)/events/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      eventsPage,
      /error:\s*(?:teamError|rolesError|teamAssignmentsError)/,
      "events list SSR must destructure and check the event_role_assignments query error",
    );

    const membersAdminPage = await readFile(
      new URL("../src/app/(member)/officers/members/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      membersAdminPage,
      /assignmentRows[\s\S]{0,120}error:\s*\w+Error/,
      "officers/members SSR must destructure and check the event_role_assignments query error",
    );
  });
});
