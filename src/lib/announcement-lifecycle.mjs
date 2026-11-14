const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_ANNOUNCEMENT_DURATION_PRESET = "30d";

export const ANNOUNCEMENT_DURATION_PRESETS = Object.freeze([
  { value: "7d", label: "7 days", days: 7 },
  { value: "14d", label: "14 days", days: 14 },
  { value: "30d", label: "30 days (Default)", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "custom", label: "Custom expiry date", days: null },
]);

const PRESET_MAP = new Map(
  ANNOUNCEMENT_DURATION_PRESETS.map((preset) => [preset.value, preset]),
);

const watDisplayFormatter = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

export function isAnnouncementDurationPreset(value) {
  return typeof value === "string" && PRESET_MAP.has(value);
}

export function getAnnouncementDurationPresetDays(preset) {
  return PRESET_MAP.get(preset)?.days ?? null;
}

export function formatWatDateTimeLocal(isoString) {
  if (!isoString) return "";
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + LAGOS_OFFSET_MS).toISOString().slice(0, 16);
}

export function formatWatDateDisplay(isoString) {
  if (!isoString) return "";
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return "";
  return `${watDisplayFormatter.format(new Date(timestamp))} WAT`;
}

export function calculateAnnouncementExpiry({
  mode = "create",
  status = "active",
  expiryAction = "preset",
  durationPreset = DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
  publishedAtIso = null,
  customExpiresAtIso = null,
  existingDurationPreset = null,
  existingExpiresAtIso = null,
  nowMs = Date.now(),
} = {}) {
  if (mode === "edit" && expiryAction === "keep") {
    return {
      ok: true,
      durationPreset: isAnnouncementDurationPreset(existingDurationPreset)
        ? existingDurationPreset
        : existingExpiresAtIso
          ? "custom"
          : DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
      expiresAt: existingExpiresAtIso ?? null,
    };
  }

  if (!isAnnouncementDurationPreset(durationPreset)) {
    return { ok: false, error: "Choose a valid announcement duration." };
  }

  const preset = PRESET_MAP.get(durationPreset);

  if (status === "draft") {
    if (durationPreset !== "custom") {
      return {
        ok: true,
        durationPreset,
        expiresAt: null,
      };
    }

    if (!customExpiresAtIso) {
      return {
        ok: false,
        error: "Choose a future custom expiry date and time.",
      };
    }
    const customMs = Date.parse(customExpiresAtIso);
    if (!Number.isFinite(customMs) || customMs <= nowMs) {
      return {
        ok: false,
        error: "Custom expiry date must be in the future.",
      };
    }
    return {
      ok: true,
      durationPreset: "custom",
      expiresAt: new Date(customMs).toISOString(),
    };
  }

  const anchorMs = publishedAtIso ? Date.parse(publishedAtIso) : nowMs;
  if (!Number.isFinite(anchorMs)) {
    return { ok: false, error: "Invalid publication timestamp." };
  }

  if (durationPreset === "custom") {
    if (!customExpiresAtIso) {
      return {
        ok: false,
        error: "Choose a future custom expiry date and time.",
      };
    }
    const customMs = Date.parse(customExpiresAtIso);
    if (
      !Number.isFinite(customMs) ||
      customMs <= nowMs ||
      customMs <= anchorMs
    ) {
      return {
        ok: false,
        error: "Custom expiry date must be in the future.",
      };
    }
    return {
      ok: true,
      durationPreset: "custom",
      expiresAt: new Date(customMs).toISOString(),
    };
  }

  const expiresAtMs = anchorMs + preset.days * DAY_MS;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return {
      ok: false,
      error: "Announcement expiry date must remain in the future.",
    };
  }

  return {
    ok: true,
    durationPreset,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function validateRestoreAnnouncementExpiry({
  archivedReason = "manual_delete",
  existingDurationPreset = null,
  existingExpiresAtIso = null,
  purgeAfterIso = null,
  expiryAction = "keep",
  durationPreset = DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
  customExpiresAtIso = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) {
    return { ok: false, error: "Invalid current timestamp." };
  }

  const purgeAfterMs = purgeAfterIso ? Date.parse(purgeAfterIso) : NaN;
  if (!Number.isFinite(purgeAfterMs) || purgeAfterMs <= nowMs) {
    return {
      ok: false,
      error: "This announcement is past its 7-day archive recovery window.",
    };
  }

  const existingMs = existingExpiresAtIso
    ? Date.parse(existingExpiresAtIso)
    : NaN;
  const hasFutureExistingExpiry =
    Number.isFinite(existingMs) && existingMs > nowMs;

  if (expiryAction === "keep") {
    if (archivedReason === "expired" || !hasFutureExistingExpiry) {
      return {
        ok: false,
        error:
          "This announcement has already expired. Set a new publication duration before restoring it.",
      };
    }
    return {
      ok: true,
      durationPreset: isAnnouncementDurationPreset(existingDurationPreset)
        ? existingDurationPreset
        : "custom",
      expiresAt: new Date(existingMs).toISOString(),
    };
  }

  return calculateAnnouncementExpiry({
    mode: "restore",
    status: "active",
    expiryAction: "preset",
    durationPreset,
    publishedAtIso: nowIso,
    customExpiresAtIso,
    nowMs,
  });
}

export function formatAnnouncementRetentionSummary({
  archiveReason,
  archivedAt,
  purgeAfter,
  nowMs = Date.now(),
} = {}) {
  const reasonLabel =
    archiveReason === "expired" ? "Expired automatically" : "Manually deleted";
  const archivedAtLabel = archivedAt
    ? formatWatDateDisplay(archivedAt)
    : "Unknown";
  const scheduledPurgeLabel = purgeAfter
    ? formatWatDateDisplay(purgeAfter)
    : "Pending";
  const purgeMs = purgeAfter ? Date.parse(purgeAfter) : NaN;
  const isRecoverable = Number.isFinite(purgeMs) && purgeMs > nowMs;

  return {
    reasonLabel,
    archivedAtLabel,
    scheduledPurgeLabel,
    isRecoverable,
  };
}
