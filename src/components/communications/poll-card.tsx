"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  History,
  Layers,
  Lock,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { castAnnouncementPollVoteAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import { percentWidthClass } from "@/lib/percent-width-class";
import type { PollItem } from "./communications-types";
import { PollEditModal } from "./poll-edit-modal";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatWAT(isoDate: string) {
  try {
    return dateFormatter.format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

interface PollCardProps {
  poll: PollItem;
}

export function PollCard({ poll }: PollCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRevisionsOpen, setIsRevisionsOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close modal when poll revision updates
  useEffect(() => {
    setIsEditOpen(false);
  }, [poll.revisionNumber]);

  const hasRevisions = poll.revisions.length > 0;
  const totalVotesCount = poll.totalVotes ?? 0;

  return (
    <article
      id={`poll-${poll.id}`}
      className="scroll-target bg-white rounded-xl border border-[#E5DDD3] p-5 shadow-xs space-y-4"
    >
      {/* Header Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Pill */}
            {poll.isOpen ? (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/30">
                Status: Open for voting
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700 border border-neutral-300">
                Status: Closed
              </span>
            )}

            {/* Scope Pill */}
            {poll.eventId ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#103D2B]/10 text-[#103D2B] border border-[#174C37]/30 font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#D6A23A]" />
                <span>Event: {poll.eventTitle ?? "Event consultation"}</span>
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3] font-semibold">
                Club-Wide Consultation
              </span>
            )}

            {/* Closing Soon Warning Badge */}
            {poll.isOpen && poll.isClosingSoon && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#FFF8E6] text-[#8A641A] border border-[#D6A23A] font-bold flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-[#D6A23A]" />
                <span>Closing soon (over 75% duration elapsed)</span>
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-bold text-[#3D291F] pt-0.5 leading-snug">
            {poll.question}
          </h3>
        </div>

        {/* Edit Action if authorized */}
        {poll.canManage && (
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="cf-btn cf-btn--neutral cf-btn--accent shrink-0"
            title="Edit poll parameters"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Edit Poll...</span>
          </button>
        )}
      </div>

      {/* ---------------- OPEN POLL VOTING INTERFACE ---------------- */}
      {poll.isOpen && (
        <div className="p-4 bg-[#FAF6F0]/60 rounded-xl border border-[#E5DDD3] space-y-3">
          <div className="text-xs font-bold text-[#3D291F] flex items-center justify-between">
            <span>Official Ballot Options</span>
            {poll.hasVoted ? (
              <span className="text-[#174C37] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Your vote is recorded</span>
              </span>
            ) : (
              <span className="text-[#7A685D] font-normal">
                Select one choice · Single vote allowed
              </span>
            )}
          </div>

          {!poll.hasVoted ? (
            <form action={castAnnouncementPollVoteAction} className="space-y-3">
              <input name="poll_id" type="hidden" value={poll.id} />

              <div className="space-y-2">
                {poll.options.map((option) => {
                  const isSelected = selectedOptionId === option.optionId;
                  return (
                    <label
                      key={option.optionId}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "bg-white border-[#174C37] shadow-2xs ring-1 ring-[#174C37]"
                          : "bg-white border-[#E5DDD3] hover:border-[#174C37]/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="option_id"
                        value={option.optionId}
                        required
                        checked={isSelected}
                        onChange={() => setSelectedOptionId(option.optionId)}
                        className="mt-0.5 text-[#174C37] focus:ring-[#174C37] cursor-pointer"
                      />
                      <span className="font-medium text-[#3D291F] flex-1">
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Confirmation and Submit */}
              <div className="pt-2 border-t border-[#E5DDD3] space-y-3">
                <label className="flex items-center gap-2 text-xs text-[#3D291F] cursor-pointer">
                  <input
                    type="checkbox"
                    name="confirm_final_vote"
                    value="yes"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded text-[#174C37] focus:ring-[#174C37]"
                  />
                  <span className="font-medium">
                    I understand this vote is final and cannot be amended.
                  </span>
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-[#7A685D] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
                    <span>
                      Ballots are 100% anonymous. Live counts are withheld until
                      voting closes.
                    </span>
                  </p>

                  <FormSubmitButton
                    disabled={!selectedOptionId || !confirmed}
                    className="cf-btn cf-btn--primary shrink-0"
                    pendingLabel="Recording Vote…"
                    statusToastMessage="Sealing your anonymous ballot."
                  >
                    Submit Final Vote
                  </FormSubmitButton>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {poll.options.map((option) => (
                  <div
                    key={option.optionId}
                    className="flex items-start gap-3 p-3 rounded-lg border border-[#E5DDD3] bg-white/50 text-xs text-[#7A685D]"
                  >
                    <span className="w-4 h-4 rounded-full border border-neutral-300 mt-0.5 shrink-0" />
                    <span className="font-medium flex-1">{option.label}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-white rounded-lg border border-[#174C37]/30 text-xs text-[#174C37] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#174C37] shrink-0" />
                <span>
                  <strong>Your vote is recorded.</strong> In accordance with
                  club privacy rules, running totals remain confidential until
                  voting closes and results are certified.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- CLOSED POLL RESULTS INTERFACE ---------------- */}
      {!poll.isOpen && (
        <div>
          {poll.state === "unavailable" ? (
            <div className="p-4 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-xs text-[#7A685D] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#3D291F]">
                <AlertCircle className="w-4 h-4 text-[#D6A23A]" />
                <span>Results Verification Pending / Unavailable</span>
              </div>
              <p>
                Final electoral tallies cannot be verified by the secretariat at
                this time. Totals are withheld in accordance with club
                governance guidelines. Missing data is never presented as zero.
              </p>
            </div>
          ) : !poll.resultsVisible ? (
            /* Privacy Threshold Triggered (< 5 votes) */
            <div className="p-4 bg-[#FFF8E6] rounded-xl border border-[#D6A23A]/60 text-xs text-[#3D291F] space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[#8A641A]">
                <Shield className="w-4 h-4 text-[#D6A23A]" />
                <span>Final Totals Withheld Under Privacy Threshold</span>
              </div>
              <p className="text-[#7A685D] leading-relaxed">
                This consultation closed with fewer than 5 member votes (
                {totalVotesCount} cast). In compliance with club confidentiality
                regulations, final choice tallies are withheld to prevent the
                deduction of individual voter identities.
              </p>
            </div>
          ) : (
            /* Verified Aggregate Results (>= 5 votes) */
            <div className="p-4 bg-[#FAF6F0]/60 rounded-xl border border-[#E5DDD3] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-[#3D291F]">
                <span>
                  Verified Anonymous Results ({totalVotesCount} total votes
                  cast)
                </span>
                <span className="text-[#174C37] font-semibold text-[11px]">
                  ✓ 5-Vote Privacy Threshold Satisfied
                </span>
              </div>

              <div className="space-y-3">
                {poll.options.map((option) => {
                  const votes = option.votes ?? 0;
                  const pct =
                    totalVotesCount > 0
                      ? Math.round((votes / totalVotesCount) * 100)
                      : 0;

                  return (
                    <div key={option.optionId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#3D291F]">
                          {option.label}
                        </span>
                        <span className="font-mono text-[#7A685D]">
                          {votes} votes ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-[#E5DDD3] h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 bg-[#174C37] ${percentWidthClass(pct)}`}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-[#7A685D] pt-2 border-t border-[#E5DDD3]/70">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-[#D6A23A]" />
          <span>
            {poll.isOpen ? "Closing: " : "Closed: "}
            <strong className="text-[#3D291F]">
              {formatWAT(poll.closesAt)}
            </strong>
          </span>
        </span>

        <div className="flex items-center gap-3">
          <span>
            Scope:{" "}
            <strong className="text-[#3D291F]">
              {poll.eventTitle ?? "Club-wide"}
            </strong>
          </span>

          {hasRevisions && (
            <button
              type="button"
              onClick={() => setIsRevisionsOpen(!isRevisionsOpen)}
              className="cf-btn cf-btn--link"
            >
              <History className="w-3 h-3 text-[#D6A23A]" />
              <span>
                {poll.revisions.length} revision
                {poll.revisions.length > 1 ? "s" : ""}
              </span>
              {isRevisionsOpen ? (
                <ChevronUp className="w-3 h-3 text-[#7A685D]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[#7A685D]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Preserved Revisions Disclosure */}
      {isRevisionsOpen && hasRevisions && (
        <div className="p-3.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-[#3D291F]">
            <History className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Preserved Poll Revision History</span>
          </div>
          <div className="space-y-2">
            {poll.revisions.map((rev) => (
              <div
                key={rev.id}
                className="p-3 bg-white rounded-lg border border-[#E5DDD3] space-y-1 text-[11px]"
              >
                <div className="flex items-center justify-between text-[#7A685D]">
                  <span className="font-semibold text-[#3D291F]">
                    Revision #{rev.revisionNumber}
                  </span>
                  <span>{formatWAT(rev.editedAt)}</span>
                </div>
                <p className="text-[#3D291F]">
                  <strong className="text-[#7A685D]">Reason for edit:</strong>{" "}
                  {rev.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {poll.canManage && (
        <PollEditModal
          poll={poll}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </article>
  );
}
