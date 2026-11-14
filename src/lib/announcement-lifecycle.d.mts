export type AnnouncementDurationPreset =
  | "7d"
  | "14d"
  | "30d"
  | "60d"
  | "90d"
  | "custom";

export type AnnouncementStatus = "draft" | "active" | "archived";

export type AnnouncementArchiveReason = "expired" | "manual_delete";

export interface AnnouncementDurationOption {
  readonly value: AnnouncementDurationPreset;
  readonly label: string;
  readonly days: number | null;
}

export const DEFAULT_ANNOUNCEMENT_DURATION_PRESET: "30d";

export const ANNOUNCEMENT_DURATION_PRESETS: readonly AnnouncementDurationOption[];

export function isAnnouncementDurationPreset(
  value: unknown,
): value is AnnouncementDurationPreset;

export function getAnnouncementDurationPresetDays(
  preset: string | null | undefined,
): number | null;

export function formatWatDateTimeLocal(
  isoString: string | null | undefined,
): string;

export function formatWatDateDisplay(
  isoString: string | null | undefined,
): string;

export function calculateAnnouncementExpiry(params?: {
  mode?: "create" | "publish" | "edit" | "restore";
  status?: "draft" | "active";
  expiryAction?: "keep" | "preset";
  durationPreset?: string | null;
  publishedAtIso?: string | null;
  customExpiresAtIso?: string | null;
  existingDurationPreset?: string | null;
  existingExpiresAtIso?: string | null;
  nowMs?: number;
}):
  | {
      ok: true;
      durationPreset: AnnouncementDurationPreset;
      expiresAt: string | null;
    }
  | { ok: false; error: string };

export function validateRestoreAnnouncementExpiry(params?: {
  archivedReason?: AnnouncementArchiveReason | string | null;
  existingDurationPreset?: string | null;
  existingExpiresAtIso?: string | null;
  purgeAfterIso?: string | null;
  expiryAction?: "keep" | "preset";
  durationPreset?: string | null;
  customExpiresAtIso?: string | null;
  nowIso?: string;
}):
  | {
      ok: true;
      durationPreset: AnnouncementDurationPreset;
      expiresAt: string;
    }
  | { ok: false; error: string };

export function formatAnnouncementRetentionSummary(params?: {
  archiveReason?: string | null;
  archivedAt?: string | null;
  purgeAfter?: string | null;
  nowMs?: number;
}): {
  reasonLabel: string;
  archivedAtLabel: string;
  scheduledPurgeLabel: string;
  isRecoverable: boolean;
};
