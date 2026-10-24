"use client";

import { Edit3, Lock, X } from "lucide-react";
import { updateAnnouncementPollAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import type { PollItem } from "./communications-types";

interface PollEditModalProps {
  poll: PollItem;
  isOpen: boolean;
  onClose: () => void;
}

export function PollEditModal({ poll, isOpen, onClose }: PollEditModalProps) {
  if (!isOpen) return null;

  const isLocked = poll.lockedAt !== null || !poll.isOpen;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`edit-poll-${poll.id}`}
      className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-xl w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37]">
              <Edit3 className="w-4 h-4 text-[#174C37]" />
            </div>
            <div>
              <h3
                id={`edit-poll-${poll.id}`}
                className="text-base font-bold text-[#3D291F]"
              >
                Edit Poll Parameters
              </h3>
              <p className="text-xs text-[#7A685D]">
                Revision #{poll.revisionNumber + 1} will be preserved in the
                audit log
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cf-btn cf-btn--icon-close"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          action={updateAnnouncementPollAction}
          className="space-y-4 text-xs"
        >
          <input name="poll_id" type="hidden" value={poll.id} />

          {/* Locked Notice if votes cast or closed */}
          {isLocked && (
            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-[#7A685D] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#3D291F]">
                <Lock className="w-4 h-4 text-[#D6A23A]" />
                <span>Structural Choices Locked</span>
              </div>
              <p>
                Because member ballots have already been cast or voting has
                concluded, questions and choice options are permanently locked
                from alteration. You may only adjust administrative deadlines
                with a recorded governance audit reason.
              </p>
            </div>
          )}

          {/* Question */}
          <div>
            <label
              htmlFor={`edit-question-${poll.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Poll Question
            </label>
            <textarea
              id={`edit-question-${poll.id}`}
              name="question"
              required
              rows={2}
              maxLength={300}
              defaultValue={poll.question}
              disabled={isLocked}
              className={`w-full p-2.5 rounded-lg border text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden ${
                isLocked
                  ? "bg-neutral-100 border-neutral-300 cursor-not-allowed text-neutral-500"
                  : "bg-[#FAF6F0] border-[#E5DDD3]"
              }`}
            />
            {isLocked && (
              <input type="hidden" name="question" value={poll.question} />
            )}
          </div>

          {/* Poll Type & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`edit-poll-type-${poll.id}`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Poll Format
              </label>
              <select
                id={`edit-poll-type-${poll.id}`}
                name="poll_type"
                defaultValue={poll.pollType}
                disabled={isLocked}
                className={`w-full p-2.5 rounded-lg border text-xs font-semibold text-[#3D291F] ${
                  isLocked
                    ? "bg-neutral-100 border-neutral-300 cursor-not-allowed text-neutral-500"
                    : "bg-[#FAF6F0] border-[#E5DDD3]"
                }`}
              >
                <option value="yes_no">Yes / No</option>
                <option value="multiple_choice">Multiple choice</option>
              </select>
              {isLocked && (
                <input type="hidden" name="poll_type" value={poll.pollType} />
              )}
            </div>

            <div>
              <label
                htmlFor={`edit-duration-${poll.id}`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Total Duration (Minutes)
              </label>
              <input
                id={`edit-duration-${poll.id}`}
                name="duration_minutes"
                type="number"
                min={5}
                max={43200}
                required
                defaultValue={poll.durationMinutes}
                className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Options for Multiple Choice */}
          {poll.pollType === "multiple_choice" && (
            <div>
              <label
                htmlFor={`edit-options-${poll.id}`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Choices (one per line)
              </label>
              <textarea
                id={`edit-options-${poll.id}`}
                name="options"
                rows={3}
                maxLength={1000}
                defaultValue={poll.options.map((o) => o.label).join("\n")}
                disabled={isLocked}
                className={`w-full p-2.5 rounded-lg border text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden ${
                  isLocked
                    ? "bg-neutral-100 border-neutral-300 cursor-not-allowed text-neutral-500"
                    : "bg-[#FAF6F0] border-[#E5DDD3]"
                }`}
              />
              {isLocked && (
                <input
                  type="hidden"
                  name="options"
                  value={poll.options.map((o) => o.label).join("\n")}
                />
              )}
            </div>
          )}
          {poll.pollType === "yes_no" && (
            <input type="hidden" name="options" value="" />
          )}

          {/* Reason */}
          <div>
            <label
              htmlFor={`edit-reason-${poll.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Reason for this Revision (Mandatory Governance Audit)
            </label>
            <input
              id={`edit-reason-${poll.id}`}
              name="reason"
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Extended voting window by 48 hours per Welfare Committee request..."
              className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5DDD3]">
            <button
              type="button"
              onClick={onClose}
              className="cf-btn cf-btn--neutral"
            >
              Cancel
            </button>
            <FormSubmitButton
              className="cf-btn cf-btn--primary"
              pendingLabel="Saving Poll…"
              statusToastMessage="Updating poll parameters and audit trail."
            >
              Save Poll Edit
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
