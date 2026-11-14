import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ANNOUNCEMENT_DURATION_PRESETS,
  calculateAnnouncementExpiry,
  formatAnnouncementRetentionSummary,
  validateRestoreAnnouncementExpiry,
} from "../src/lib/announcement-lifecycle.mjs";
import { getHomeDashboardData } from "../src/lib/home-dashboard.mjs";

const root = process.cwd();

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function findLifecycleMigration() {
  const migrationsDir = path.join(root, "supabase", "migrations");
  const match = fs
    .readdirSync(migrationsDir)
    .sort()
    .find((name) => name.includes("announcement_lifecycle_archive_retention"));
  return match ? readSource(path.join("supabase", "migrations", match)) : null;
}

test("Issue 05: duration presets compute expiry from publication timestamp and reject past custom dates", () => {
  assert.deepEqual(
    ANNOUNCEMENT_DURATION_PRESETS.map((preset) => preset.value),
    ["7d", "14d", "30d", "60d", "90d", "custom"],
  );

  const publishedAt = "2026-11-14T10:00:00.000Z";
  const nowMs = Date.parse("2026-11-14T10:00:00.000Z");

  const thirtyDays = calculateAnnouncementExpiry({
    durationPreset: "30d",
    publishedAtIso: publishedAt,
    nowMs,
  });
  assert.equal(thirtyDays.ok, true);
  assert.equal(thirtyDays.expiresAt, "2026-12-14T10:00:00.000Z");

  const sevenDays = calculateAnnouncementExpiry({
    durationPreset: "7d",
    publishedAtIso: publishedAt,
    nowMs,
  });
  assert.equal(sevenDays.ok, true);
  assert.equal(sevenDays.expiresAt, "2026-11-21T10:00:00.000Z");

  const customPast = calculateAnnouncementExpiry({
    durationPreset: "custom",
    publishedAtIso: publishedAt,
    customExpiresAtIso: "2026-11-13T10:00:00.000Z",
    nowMs,
  });
  assert.equal(customPast.ok, false);

  const customFuture = calculateAnnouncementExpiry({
    durationPreset: "custom",
    publishedAtIso: publishedAt,
    customExpiresAtIso: "2026-12-01T18:30:00.000Z",
    nowMs,
  });
  assert.equal(customFuture.ok, true);
  assert.equal(customFuture.expiresAt, "2026-12-01T18:30:00.000Z");
});

test("Issue 05: draft announcements keep null preset countdown until published and edits preserve expiry in keep mode", () => {
  const draftResult = calculateAnnouncementExpiry({
    status: "draft",
    durationPreset: "30d",
    nowMs: Date.parse("2026-11-14T10:00:00.000Z"),
  });
  assert.equal(draftResult.ok, true);
  assert.equal(draftResult.expiresAt, null);

  const keepEdit = calculateAnnouncementExpiry({
    mode: "edit",
    expiryAction: "keep",
    existingDurationPreset: "30d",
    existingExpiresAtIso: "2026-11-24T18:53:54.000Z",
    nowMs: Date.parse("2026-11-14T10:00:00.000Z"),
  });
  assert.equal(keepEdit.ok, true);
  assert.equal(keepEdit.durationPreset, "30d");
  assert.equal(keepEdit.expiresAt, "2026-11-24T18:53:54.000Z");
});

test("Issue 06: expired archived announcements require a new future expiry before restoration", () => {
  const nowIso = "2026-11-14T12:00:00.000Z";
  const blockedRestore = validateRestoreAnnouncementExpiry({
    archivedReason: "expired",
    existingExpiresAtIso: "2026-11-10T12:00:00.000Z",
    purgeAfterIso: "2026-11-17T12:00:00.000Z",
    expiryAction: "keep",
    nowIso,
  });
  assert.equal(blockedRestore.ok, false);

  const validRestore = validateRestoreAnnouncementExpiry({
    archivedReason: "expired",
    existingExpiresAtIso: "2026-11-10T12:00:00.000Z",
    purgeAfterIso: "2026-11-17T12:00:00.000Z",
    expiryAction: "preset",
    durationPreset: "14d",
    nowIso,
  });
  assert.equal(validRestore.ok, true);
  assert.equal(validRestore.expiresAt, "2026-11-28T12:00:00.000Z");

  const expiredWindow = validateRestoreAnnouncementExpiry({
    archivedReason: "manual_delete",
    existingExpiresAtIso: "2026-11-30T12:00:00.000Z",
    purgeAfterIso: "2026-11-14T11:00:00.000Z",
    expiryAction: "keep",
    nowIso,
  });
  assert.equal(expiredWindow.ok, false);

  const summary = formatAnnouncementRetentionSummary({
    archiveReason: "manual_delete",
    archivedAt: "2026-11-14T12:00:00.000Z",
    purgeAfter: "2026-11-21T12:00:00.000Z",
  });
  assert.equal(summary.reasonLabel, "Manually deleted");
  assert.match(summary.scheduledPurgeLabel, /2026/);
});

test("Issue 07: AnnouncementCard removes the Read pill and updates UI immediately via inline read action", () => {
  const cardSource = readSource(
    "src/components/communications/announcement-card.tsx",
  );
  const viewSource = readSource(
    "src/components/communications/announcements-page-view.tsx",
  );
  const actionsSource = readSource("src/app/actions.ts");

  assert.doesNotMatch(
    cardSource,
    /:\s*isUnread\s*\?\s*"Unread"\s*:\s*"Read"/,
    "AnnouncementCard must omit the persistent Read badge once read",
  );
  assert.match(
    cardSource,
    /markAnnouncementReadInlineAction|onMarkAsRead/,
    "AnnouncementCard must trigger immediate non-redirecting read marking",
  );
  assert.match(
    viewSource,
    /optimisticReadIds|readAnnouncementIds/,
    "AnnouncementsPageView must track immediate client read state",
  );
  assert.match(
    actionsSource,
    /export async function markAnnouncementReadInlineAction/,
    "actions.ts must expose a non-redirecting inline read action",
  );
});

test("Issues 05 & 06: database migration enforces DRAFT -> ACTIVE -> ARCHIVED -> PERMANENTLY DELETED lifecycle, scoped auth, and retention", () => {
  const migrationSql = findLifecycleMigration();
  assert.ok(
    migrationSql,
    "Expected announcement_lifecycle_archive_retention SQL migration file",
  );
  assert.match(migrationSql, /add column if not exists status text/i);
  assert.match(migrationSql, /add column if not exists duration_preset text/i);
  assert.match(
    migrationSql,
    /add column if not exists published_at timestamptz/i,
  );
  assert.match(
    migrationSql,
    /add column if not exists archived_at timestamptz/i,
  );
  assert.match(migrationSql, /add column if not exists archive_reason text/i);
  assert.match(
    migrationSql,
    /add column if not exists purge_after timestamptz/i,
  );
  assert.match(migrationSql, /has_club_role\('president'\)/i);
  assert.match(migrationSql, /function public\.publish_announcement\(/i);
  assert.match(migrationSql, /function public\.archive_announcement\(/i);
  assert.match(migrationSql, /function public\.restore_announcement\(/i);
  assert.match(migrationSql, /function public\.list_draft_announcements\(/i);
  assert.match(migrationSql, /function public\.list_archived_announcements\(/i);
  assert.match(
    migrationSql,
    /function private\.process_announcement_lifecycle\(/i,
  );
  assert.match(migrationSql, /carpenters-announcement-lifecycle/);
  assert.match(migrationSql, /app\.communication_purge/);
  assert.match(migrationSql, /app\.notification_delete_write/);
});

test("Issues 05 & 06: active announcement queries across communications, home dashboard, and topbar search filter out drafts/archived/expired", () => {
  const communicationsPage = readSource(
    "src/app/(member)/communications-page.tsx",
  );
  const homeDashboard = readSource("src/lib/home-dashboard.mjs");
  const memberLayout = readSource("src/app/(member)/layout.tsx");

  for (const [label, source] of [
    ["communications-page", communicationsPage],
    ["home-dashboard", homeDashboard],
    ["member layout", memberLayout],
  ]) {
    assert.match(
      source,
      /\.eq\("status",\s*"active"\)/,
      `${label} must filter announcements by status = 'active'`,
    );
    assert.match(
      source,
      /expires_at\.is\.null,expires_at\.gt\./,
      `${label} must exclude expired announcements from active feeds`,
    );
  }
});

test("Issues 05 & 06: announcements UI supports drafts, duration config/edit, delete confirmation, archive tab, and restore", () => {
  const publishSource = readSource(
    "src/components/communications/publish-announcement-disclosure.tsx",
  );
  const editSource = readSource(
    "src/components/communications/announcement-edit-modal.tsx",
  );
  const durationFieldsSource = readSource(
    "src/components/communications/announcement-duration-fields.tsx",
  );
  const archiveSource = readSource(
    "src/components/communications/announcement-archive-section.tsx",
  );
  const viewSource = readSource(
    "src/components/communications/announcements-page-view.tsx",
  );
  const actionsSource = readSource("src/app/actions.ts");

  assert.match(durationFieldsSource, /duration_preset/);
  assert.match(durationFieldsSource, /Keep current/i);
  assert.match(publishSource, /AnnouncementDurationFields/);
  assert.match(publishSource, /Save Draft/i);
  assert.match(editSource, /AnnouncementDurationFields/);
  assert.match(
    archiveSource,
    /AnnouncementRestoreModal|restoreAnnouncementAction/,
  );
  assert.match(viewSource, /Archive/);
  assert.match(actionsSource, /publishDraftAnnouncementAction/);
  assert.match(actionsSource, /archiveAnnouncementAction/);
  assert.match(actionsSource, /restoreAnnouncementAction/);
});

test("Issue 05 regression: home dashboard accepts active standard announcements with non-null expires_at", async () => {
  const memberId = "11111111-1111-4111-8111-111111111111";
  const standardId = "22222222-2222-4222-8222-222222222222";
  const tables = {
    dues_month_status: { data: [], error: null },
    events: { data: [], count: 0, error: null },
    announcements: {
      data: [
        {
          id: standardId,
          title: "Standard 30-day club circular",
          message: "Active standard notice with automatic 30-day expiry.",
          created_at: "2026-10-25T18:53:54.000Z",
          priority: "standard",
          expires_at: "2026-11-24T18:53:54.000Z",
        },
      ],
      error: null,
    },
    ticket_orders: { data: [], count: 0, error: null },
    notifications: { data: [], count: 0, error: null },
    dues_payments: { data: [], error: null },
  };
  const fakeSupabase = {
    from(table) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        in() {
          return builder;
        },
        is() {
          return builder;
        },
        gte() {
          return builder;
        },
        gt() {
          return builder;
        },
        lt() {
          return builder;
        },
        or() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        range() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        // biome-ignore lint/suspicious/noThenProperty: minimal Supabase mock
        then(resolve, reject) {
          const result = tables[table] ?? { data: [], count: 0, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  };

  const dashboard = await getHomeDashboardData(
    fakeSupabase,
    memberId,
    new Date("2026-11-14T10:00:00.000Z"),
  );
  assert.equal(dashboard.announcements.unavailable, false);
  assert.equal(dashboard.announcements.rows.length, 1);
  assert.equal(dashboard.announcements.rows[0].id, standardId);
  assert.equal(
    dashboard.announcements.rows[0].expiresAt,
    "2026-11-24T18:53:54.000Z",
  );
});
