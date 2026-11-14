"use client";

import { CalendarClock, Clock } from "lucide-react";
import {
  ANNOUNCEMENT_DURATION_PRESETS,
  type AnnouncementDurationPreset,
  calculateAnnouncementExpiry,
  formatWatDateDisplay,
  getAnnouncementDurationPresetDays,
} from "@/lib/announcement-lifecycle.mjs";

interface AnnouncementDurationFieldsProps {
  idPrefix: string;
  durationPreset: AnnouncementDurationPreset;
  onDurationPresetChange: (preset: AnnouncementDurationPreset) => void;
  customExpiresAt: string;
  onCustomExpiresAtChange: (value: string) => void;
  expiryAction?: "keep" | "set";
  onExpiryActionChange?: (action: "keep" | "set") => void;
  allowKeepCurrent?: boolean;
  currentExpiresAtIso?: string | null;
  isDraft?: boolean;
  requireFutureNotice?: string;
}

export function AnnouncementDurationFields({
  idPrefix,
  durationPreset,
  onDurationPresetChange,
  customExpiresAt,
  onCustomExpiresAtChange,
  expiryAction = "set",
  onExpiryActionChange,
  allowKeepCurrent = false,
  currentExpiresAtIso = null,
  isDraft = false,
  requireFutureNotice,
}: AnnouncementDurationFieldsProps) {
  const showDurationControls = !allowKeepCurrent || expiryAction === "set";
  const currentExpiryDisplay = currentExpiresAtIso
    ? formatWatDateDisplay(currentExpiresAtIso)
    : null;

  const parsedCustomTimestamp =
    durationPreset === "custom" && customExpiresAt
      ? Date.parse(`${customExpiresAt}:00+01:00`)
      : NaN;
  const customExpiresAtIso = Number.isFinite(parsedCustomTimestamp)
    ? new Date(parsedCustomTimestamp).toISOString()
    : null;

  const previewResult =
    !showDurationControls || isDraft
      ? null
      : calculateAnnouncementExpiry({
          mode: "edit",
          status: "active",
          expiryAction: "preset",
          durationPreset,
          customExpiresAtIso,
        });

  const presetDays = getAnnouncementDurationPresetDays(durationPreset);

  return (
    <div className="space-y-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/60 p-3.5">
      {allowKeepCurrent && onExpiryActionChange && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#3D291F] flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Publication Duration</span>
            </span>
            {currentExpiryDisplay && (
              <span className="text-[11px] text-[#7A685D]">
                Current expiry: {currentExpiryDisplay}
              </span>
            )}
          </div>

          <input type="hidden" name="expiry_action" value={expiryAction} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onExpiryActionChange("keep")}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold text-left transition-colors ${
                expiryAction === "keep"
                  ? "bg-[#174C37] text-white border-[#174C37]"
                  : "bg-white text-[#3D291F] border-[#E5DDD3] hover:border-[#174C37]/40"
              }`}
            >
              Keep current expiry
            </button>
            <button
              type="button"
              onClick={() => onExpiryActionChange("set")}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-xs font-semibold text-left transition-colors ${
                expiryAction === "set"
                  ? "bg-[#174C37] text-white border-[#174C37]"
                  : "bg-white text-[#3D291F] border-[#E5DDD3] hover:border-[#174C37]/40"
              }`}
            >
              Update duration / expiry
            </button>
          </div>
        </div>
      )}

      {requireFutureNotice && (
        <p className="text-[11px] font-semibold text-[#8A641A] bg-[#FFF8E6] border border-[#D6A23A]/40 rounded-lg px-3 py-2">
          {requireFutureNotice}
        </p>
      )}

      {showDurationControls && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${idPrefix}-duration-preset`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Active Duration
            </label>
            <select
              id={`${idPrefix}-duration-preset`}
              name="duration_preset"
              value={durationPreset}
              onChange={(event) =>
                onDurationPresetChange(
                  event.target.value as AnnouncementDurationPreset,
                )
              }
              className="w-full min-h-[44px] p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            >
              {ANNOUNCEMENT_DURATION_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {durationPreset === "custom" ? (
            <div>
              <label
                htmlFor={`${idPrefix}-custom-expires`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Custom Expiry Date & Time (WAT)
              </label>
              <input
                id={`${idPrefix}-custom-expires`}
                name="expires_at"
                type="datetime-local"
                required
                value={customExpiresAt}
                onChange={(event) =>
                  onCustomExpiresAtChange(event.target.value)
                }
                className="w-full min-h-[44px] p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
            </div>
          ) : (
            <div className="flex items-end">
              <div className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-white border border-[#E5DDD3] flex items-center gap-2 text-[11px] text-[#5C4638]">
                <Clock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
                <span>
                  {isDraft
                    ? `Starts ${presetDays ?? 30}-day countdown when published.`
                    : previewResult?.ok && previewResult.expiresAt
                      ? `Expires ${formatWatDateDisplay(previewResult.expiresAt)}`
                      : `Active for ${presetDays ?? 30} days from publish time.`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
