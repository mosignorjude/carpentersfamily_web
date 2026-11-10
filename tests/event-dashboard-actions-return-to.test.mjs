import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSafeEventDashboardReturnUrl } from "../src/lib/event-finance-tab.mjs";

const actionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL(
    "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const editModalSource = readFileSync(
  new URL("../src/components/events/event-edit-modal.tsx", import.meta.url),
  "utf8",
);
const lifecycleModalSource = readFileSync(
  new URL(
    "../src/components/events/event-lifecycle-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);
const typesSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/dashboard-types.ts",
    import.meta.url,
  ),
  "utf8",
);

test("buildSafeEventDashboardReturnUrl accepts only exact same-event dashboard path and falls back otherwise", () => {
  const evtId = "4b329eb6-3225-437a-a897-7bc8537521db";
  const otherId = "11111111-2222-4333-8444-555555555555";

  assert.equal(
    buildSafeEventDashboardReturnUrl(
      evtId,
      "updated",
      `/events/${evtId}/dashboard`,
      "/events?notice=updated",
    ),
    `/events/${evtId}/dashboard?notice=updated`,
  );

  assert.equal(
    buildSafeEventDashboardReturnUrl(
      evtId,
      "event-role-assigned",
      `  /events/${evtId}/dashboard  `,
      "/events?notice=event-role-assigned",
    ),
    `/events/${evtId}/dashboard?notice=event-role-assigned`,
  );

  for (const unsafe of [
    null,
    undefined,
    "",
    "officer-members",
    `/events/${otherId}/dashboard`,
    `/events/${evtId}/dashboard?evil=1`,
    "//evil.example/events",
    "https://evil.example/events",
    `/events/../${evtId}/dashboard`,
  ]) {
    assert.equal(
      buildSafeEventDashboardReturnUrl(
        evtId,
        "updated",
        unsafe,
        "/events?notice=updated",
      ),
      "/events?notice=updated",
      `${String(unsafe)} must fall back cleanly`,
    );
  }
});

test("dashboard event/role actions accept return_to (>= 100 chars) and revalidate dashboard path", () => {
  const actionNames = [
    "updateEventDetailsAction",
    "assignEventRoleAction",
    "revokeEventRoleAction",
    "setEventStatusAction",
    "reopenEventAction",
    "archiveEventAction",
  ];

  for (const name of actionNames) {
    const start = actionsSource.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const nextAction = actionsSource.indexOf(
      "export async function",
      start + 1,
    );
    const body = actionsSource.slice(
      start,
      nextAction === -1 ? undefined : nextAction,
    );

    assert.match(
      body,
      /optionalEventText\(formData,\s*"return_to",\s*(?:1[0-9]{2}|[2-9][0-9]{2})\)/,
      `${name} must read return_to with >= 100 char limit so /events/<uuid>/dashboard is never truncated`,
    );
    assert.match(
      body,
      /["']return_to["']/,
      `${name} must allow return_to inside eventFieldsOnly`,
    );
    assert.match(
      body,
      /revalidatePath\(`\/events\/\$\{eventId\}\/dashboard`\)/,
      `${name} must revalidate the event dashboard route`,
    );
    assert.match(
      body,
      /buildSafeEventDashboardReturnUrl\(/,
      `${name} must use buildSafeEventDashboardReturnUrl`,
    );
  }
});

test("event edit and lifecycle modals forward optional returnTo input", () => {
  assert.match(editModalSource, /returnTo\?:\s*string/);
  assert.match(
    editModalSource,
    /name="return_to"[\s\S]*value=\{returnTo\}/,
  );
  assert.match(lifecycleModalSource, /returnTo\?:\s*string/);
  assert.match(
    lifecycleModalSource,
    /name="return_to"[\s\S]*value=\{returnTo\}/,
  );
});

test("dashboard/page.tsx and dashboard-types.ts expose sha256, tierName, eventRow, and team-role permissions", () => {
  assert.match(typesSource, /sha256\?:\s*string\s*\|\s*null/);
  assert.match(typesSource, /tierName\?:\s*string/);
  assert.match(typesSource, /memberId\?:\s*string/);
  assert.match(typesSource, /roleKey\?:\s*string/);
  assert.match(typesSource, /export interface DashboardClubMember/);

  assert.match(
    pageSource,
    /\.from\("finance_receipts"\)[\s\S]*sha256/,
    "page.tsx must select sha256 on finance_receipts",
  );
  assert.match(
    pageSource,
    /eventRoles\.includes\("assistant"\)/,
    "page.tsx must include assistant event leads",
  );
  assert.match(
    pageSource,
    /getEventCardAccess\(/,
    "page.tsx must derive edit and lifecycle access via getEventCardAccess",
  );
  assert.match(
    pageSource,
    /canManageTeamRoles/,
    "page.tsx must pass canManageTeamRoles",
  );
  for (const noticeKey of [
    "updated",
    "completed",
    "cancelled",
    "reopened",
    "archived",
    "event-role-assigned",
    "event-role-revoked",
  ]) {
    assert.match(
      pageSource,
      new RegExp(`["']?${noticeKey}["']?\\s*:`),
      `dashboardNoticeMap must include ${noticeKey}`,
    );
  }

  assert.match(
    pageSource,
    /t\.verification_status\s*!==\s*"rejected"/,
    "page.tsx must exclude rejected transactions from unvoidedExpenses and unvoidedIncomes",
  );
  assert.match(
    pageSource,
    /const\s+isTxnApproved\s*=[\s\S]*verification_status[\s\S]*approved/,
    "page.tsx cost-center spent and income actual aggregates must require verification approval",
  );
});
