"use client";

import { ChevronDown, ChevronUp, Lock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createAnnouncementPollAction } from "@/app/actions";
import type { EventOption } from "./communications-types";

interface CreatePollDisclosureProps {
  globalPublisher: boolean;
  publishEvents: EventOption[];
}

interface ChoiceItem {
  id: string;
  text: string;
}

export function CreatePollDisclosure({
  globalPublisher,
  publishEvents,
}: CreatePollDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pollType, setPollType] = useState<"multiple_choice" | "yes_no">(
    "multiple_choice",
  );
  const [choices, setChoices] = useState<ChoiceItem[]>([
    { id: "c-1", text: "" },
    { id: "c-2", text: "" },
    { id: "c-3", text: "" },
  ]);
  const [durationMinutes, setDurationMinutes] = useState(1440); // 24 hours default

  const handleAddChoice = () => {
    if (choices.length < 8) {
      setChoices([
        ...choices,
        { id: `c-${Date.now()}-${choices.length}`, text: "" },
      ]);
    }
  };

  const handleRemoveChoice = (id: string) => {
    if (choices.length > 2) {
      setChoices(choices.filter((c) => c.id !== id));
    }
  };

  const handleChoiceChange = (id: string, val: string) => {
    setChoices(choices.map((c) => (c.id === id ? { ...c, text: val } : c)));
  };

  // Multiple choice options joined by newline for server action
  const serializedOptions = choices
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join("\n");

  return (
    <div className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="cf-btn cf-btn--accordion w-full"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#3D291F]">Create a poll</h2>
            <p className="text-xs text-[#7A685D]">
              {globalPublisher
                ? "Authorized to open club-wide or event consultations"
                : "Authorized to open consultations for assigned active events"}
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#7A685D]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#7A685D]" />
        )}
      </button>

      {isOpen && (
        <div className="p-5 border-t border-[#E5DDD3] bg-[#FAF6F0]/40">
          <form
            action={createAnnouncementPollAction}
            className="space-y-4 max-w-2xl"
          >
            {/* Audience selection */}
            <div>
              <label
                htmlFor="poll-audience"
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Audience / Scope
              </label>
              <select
                id="poll-audience"
                name="event_id"
                defaultValue={
                  globalPublisher ? "" : (publishEvents[0]?.id ?? "")
                }
                className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              >
                {globalPublisher && (
                  <option value="">Club-Wide (All Active Members)</option>
                )}
                {publishEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    Event: {event.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Question */}
            <div>
              <label
                htmlFor="poll-question"
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Poll Question (Plain text)
              </label>
              <textarea
                id="poll-question"
                name="question"
                required
                rows={2}
                maxLength={300}
                placeholder="e.g. Do you support the proposed banquet schedule adjustment for the flagship gathering?"
                className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
            </div>

            {/* Poll Format */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="poll-format"
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                >
                  Poll Format
                </label>
                <select
                  id="poll-format"
                  name="poll_type"
                  value={pollType}
                  onChange={(e) =>
                    setPollType(e.target.value as "multiple_choice" | "yes_no")
                  }
                  className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="yes_no">Yes / No Consultation</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="poll-duration"
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                >
                  Voting Duration (Minutes)
                </label>
                <input
                  id="poll-duration"
                  name="duration_minutes"
                  type="number"
                  min={5}
                  max={43200}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Quick Duration Preset Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="text-[11px] font-semibold text-[#7A685D]">
                Presets:
              </span>
              {[
                { label: "24 Hours (1 Day)", mins: 1440 },
                { label: "3 Days", mins: 4320 },
                { label: "7 Days (1 Week)", mins: 10080 },
                { label: "14 Days", mins: 20160 },
              ].map((preset) => (
                <button
                  key={preset.mins}
                  type="button"
                  onClick={() => setDurationMinutes(preset.mins)}
                  className={`cf-btn cf-btn--compact ${
                    durationMinutes === preset.mins
                      ? "cf-btn--tab-active"
                      : "cf-btn--neutral"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Multiple Choice Options Builder */}
            {pollType === "multiple_choice" ? (
              <div className="space-y-2.5 pt-2 border-t border-[#E5DDD3]">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-[#3D291F]">
                    Poll Choices (Minimum 2, Maximum 8)
                  </span>
                  <span className="text-[11px] text-[#7A685D]">
                    {choices.length} options defined
                  </span>
                </div>

                <div className="space-y-2">
                  {choices.map((choice, idx) => (
                    <div key={choice.id} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#7A685D] w-6 shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={choice.text}
                        onChange={(e) =>
                          handleChoiceChange(choice.id, e.target.value)
                        }
                        placeholder={`Option ${idx + 1}`}
                        required
                        className="flex-1 p-2 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
                      />
                      {choices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(choice.id)}
                          className="cf-btn cf-btn--icon-close"
                          title="Remove option"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {choices.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddChoice}
                    className="cf-btn cf-btn--link"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add another choice</span>
                  </button>
                )}

                {/* Hidden serialized options field for server action */}
                <textarea
                  name="options"
                  readOnly
                  value={serializedOptions}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            ) : (
              <div className="p-3 bg-white rounded-lg border border-[#E5DDD3] text-xs text-[#5C4638] space-y-1">
                <span className="font-semibold text-[#174C37]">
                  Yes / No Consultation:
                </span>
                <p className="text-[11px] text-[#7A685D]">
                  Members will vote between &ldquo;Yes&rdquo; and
                  &ldquo;No&rdquo;. No custom options required.
                </p>
                {/* Hidden empty options field for yes_no */}
                <input type="hidden" name="options" value="" />
              </div>
            )}

            {/* Confidentiality Notice */}
            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-[11px] text-[#7A685D] flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0 mt-0.5" />
              <p>
                <strong>Confidentiality Policy:</strong> In accordance with club
                bylaws, all member votes are permanently anonymous. Running
                totals stay hidden until voting concludes, and are released only
                when 5 or more votes are cast.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cf-btn cf-btn--neutral"
              >
                Cancel
              </button>
              <button type="submit" className="cf-btn cf-btn--primary">
                Open Poll
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
