"use client";

import { AlertCircle, CheckCircle2, Vote } from "lucide-react";
import { useMemo } from "react";
import PollLiveRefresh from "@/app/(member)/announcements/poll-live-refresh";
import { CommunicationsNav } from "./communications-nav";
import { CommunicationsPrivacyBanner } from "./communications-privacy-banner";
import type { EventOption, PollItem } from "./communications-types";
import { CreatePollDisclosure } from "./create-poll-disclosure";
import { PollCard } from "./poll-card";

interface PollsPageViewProps {
  polls: PollItem[];
  unreadAnnouncementsCount: number;
  openPollsCount: number;
  globalPublisher: boolean;
  publishEvents: EventOption[];
  notice?: string;
  errorMessage?: string;
  historyUnavailableMessage?: string;
  pollSummaryUnavailable?: boolean;
}

export function PollsPageView({
  polls,
  unreadAnnouncementsCount,
  openPollsCount,
  globalPublisher,
  publishEvents,
  notice: _notice,
  errorMessage,
  historyUnavailableMessage,
  pollSummaryUnavailable,
}: PollsPageViewProps) {
  const openPolls = useMemo(() => polls.filter((p) => p.isOpen), [polls]);
  const closedPolls = useMemo(() => polls.filter((p) => !p.isOpen), [polls]);

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <CommunicationsNav
        activeScreen="polls"
        unreadAnnouncementsCount={unreadAnnouncementsCount}
        openPollsCount={openPollsCount}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#3D291F] tracking-tight">
            Polls
          </h1>
          <p className="text-sm text-[#7A685D] mt-1 max-w-2xl">
            Official club consultations and member decisions. All votes are
            anonymous and final.
          </p>
        </div>

        <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3] self-start sm:self-auto font-medium">
          Electoral Governance Protocol
        </span>
      </div>

      {/* Live Refresh Component */}
      <PollLiveRefresh activePolls={openPolls.length > 0} />

      {/* Error or History Unavailable Banners */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#8B261E] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#8B261E] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {historyUnavailableMessage && (
        <div
          role="status"
          className="p-3.5 bg-[#FFF8E6] border border-[#D6A23A]/50 rounded-xl text-xs text-[#8A641A] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#D6A23A] shrink-0" />
          <span>{historyUnavailableMessage}</span>
        </div>
      )}

      {pollSummaryUnavailable && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#8B261E] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#8B261E] shrink-0" />
          <span>
            Poll vote tallies are temporarily unavailable. Individual ballot
            choices remain anonymous.
          </span>
        </div>
      )}

      {/* Create Poll Disclosure (if authorized) */}
      {(globalPublisher || publishEvents.length > 0) && (
        <CreatePollDisclosure
          globalPublisher={globalPublisher}
          publishEvents={publishEvents}
        />
      )}

      {/* Polls Content */}
      {polls.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5DDD3] p-12 text-center space-y-2">
          <Vote className="w-8 h-8 text-[#7A685D] mx-auto opacity-40" />
          <h2 className="text-base font-bold text-[#3D291F]">
            There are no polls yet
          </h2>
          <p className="text-xs text-[#7A685D] max-w-md mx-auto">
            Active club consultations and referendum ballots will appear here
            once scheduled.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 1: OPEN POLLS */}
          <section className="space-y-4" aria-labelledby="open-polls-heading">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
              <div className="flex items-center gap-2">
                <Vote className="w-5 h-5 text-[#174C37]" />
                <h2
                  id="open-polls-heading"
                  className="text-lg font-bold text-[#3D291F]"
                >
                  Open for Voting ({openPolls.length})
                </h2>
              </div>
              <span className="text-xs text-[#7A685D]">
                Live anonymous ballots
              </span>
            </div>

            {openPolls.length === 0 ? (
              <div className="p-8 bg-white rounded-xl border border-[#E5DDD3] text-center text-xs text-[#7A685D]">
                There are no open polls accepting votes at this time.
              </div>
            ) : (
              <div className="space-y-4">
                {openPolls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} />
                ))}
              </div>
            )}
          </section>

          {/* SECTION 2: CLOSED POLLS */}
          <section className="space-y-4" aria-labelledby="closed-polls-heading">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#7A685D]" />
                <h2
                  id="closed-polls-heading"
                  className="text-lg font-bold text-[#3D291F]"
                >
                  Closed Polls ({closedPolls.length})
                </h2>
              </div>
              <span className="text-xs text-[#7A685D]">
                Concluded ballots & verified final totals
              </span>
            </div>

            {closedPolls.length === 0 ? (
              <div className="p-8 bg-white rounded-xl border border-[#E5DDD3] text-center text-xs text-[#7A685D]">
                There are no archived closed polls.
              </div>
            ) : (
              <div className="space-y-4">
                {closedPolls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Page Footer Policy */}
      <footer className="pt-4 border-t border-[#E5DDD3]/75 space-y-4">
        <CommunicationsPrivacyBanner view="polls" />
      </footer>
    </div>
  );
}
