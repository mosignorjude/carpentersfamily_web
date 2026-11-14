import Link from "next/link";
import { redirect } from "next/navigation";
import { AnnouncementsPageView } from "@/components/communications/announcements-page-view";
import type {
  AnnouncementArchiveItem,
  AnnouncementDraftItem,
  AnnouncementItem,
  AnnouncementPriority,
  EventOption,
  PollItem,
} from "@/components/communications/communications-types";
import { PollsPageView } from "@/components/communications/polls-page-view";
import type {
  AnnouncementArchiveReason,
  AnnouncementDurationPreset,
  AnnouncementStatus,
} from "@/lib/announcement-lifecycle.mjs";
import {
  getCommunicationsPageAccess,
  getPollSummaryPresentation,
} from "@/lib/communications-page-access.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AnnouncementRow = {
  id: string;
  event_id: string | null;
  title: string;
  message: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  revision_number: number;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  duration_preset: AnnouncementDurationPreset;
  expires_at: string | null;
};

type DraftAnnouncementRow = {
  id: string;
  event_id: string | null;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  duration_preset: AnnouncementDurationPreset;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  revision_number: number;
};

type ArchivedAnnouncementRow = {
  id: string;
  event_id: string | null;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  duration_preset: AnnouncementDurationPreset;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string;
  archived_by: string | null;
  archive_reason: AnnouncementArchiveReason;
  purge_after: string;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  revision_number: number;
};

type PollRow = {
  id: string;
  event_id: string | null;
  question: string;
  poll_type: "yes_no" | "multiple_choice";
  created_at: string;
  closes_at: string;
  locked_at: string | null;
  revision_number: number;
};

type PollSummaryRow = {
  poll_id: string;
  option_id: string;
  option_position: number;
  label: string;
  votes: number | null;
  has_voted: boolean;
  results_visible: boolean;
};

type AnnouncementRevisionRow = {
  id: string;
  announcement_id: string;
  revision_number: number;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  duration_preset: AnnouncementDurationPreset;
  expires_at: string | null;
  edited_at: string;
  reason: string;
};

type PollRevisionRow = {
  id: string;
  poll_id: string;
  revision_number: number;
  question: string;
  poll_type: string;
  options: string[];
  closes_at: string;
  edited_at: string;
  reason: string;
};

type EventRow = { id: string; title: string; archived_at: string | null };

const notices: Record<string, string> = {
  created: "The announcement was posted.",
  "announcement-created": "The announcement was posted.",
  "announcement-draft-saved":
    "Announcement saved as a draft. No emails or notifications were sent.",
  updated: "The announcement edit and its reason were saved.",
  "announcement-updated": "The announcement edit and its reason were saved.",
  "announcement-archived":
    "Announcement moved to Archive and will remain recoverable for 7 days.",
  "announcement-restored": "The announcement was restored to the active feed.",
  read: "Your private read marker was saved.",
  "announcement-read": "Your private read marker was saved.",
  "poll-created": "The poll is open for voting.",
  "poll-updated": "The poll edit and its reason were saved.",
  voted: "Your final vote was recorded.",
  "invalid-request": "Check the fields and try again.",
  "announcement-already-archived":
    "This announcement has already been moved to Archive.",
  "announcement-recovery-expired":
    "The 7-day archive recovery window has ended.",
  "announcement-restore-required":
    "Archived announcements must be restored before editing.",
  "announcement-future-expiry-required":
    "Expired announcements require a new future duration before restoration.",
  "invalid-state":
    "That action is not available for the announcement's current state.",
  "already-processed": "That announcement has already been moved.",
  "closed-or-locked": "The 7-day archive recovery window has ended.",
  denied: "You are not allowed to make that change.",
  "operation-failed":
    "The request could not be saved. It may be outside your permissions or the poll may have closed.",
};

function isClosingSoon(poll: PollRow, now: number) {
  const startsAt = new Date(poll.created_at).getTime();
  const closesAt = new Date(poll.closes_at).getTime();
  return now < closesAt && now >= startsAt + (closesAt - startsAt) * 0.75;
}

export default async function CommunicationsPage({
  searchParams,
  view,
}: {
  searchParams: Promise<{ notice?: string }>;
  view: "announcements" | "polls";
}) {
  const params = await searchParams;
  const isPollsPage = view === "polls";
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#3D291F]">
            {isPollsPage ? "Polls unavailable" : "Announcements unavailable"}
          </h1>
          <p className="text-sm text-[#7A685D]">
            Authentication is not configured in this environment.
          </p>
        </div>
      </div>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const [
    { data: profile, error: profileError },
    { data: roleRows, error: roleError },
    { data: eventRoleRows, error: eventRoleError },
  ] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("status")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("event_id,role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null)
      .eq("role", "lead"),
  ]);

  if (profileError || profile?.status !== "active") {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#3D291F]">Access denied</h1>
          <p className="text-sm text-[#7A685D]">
            {isPollsPage
              ? "Polls and voting are available to active members."
              : "Announcements are available to active members."}
          </p>
          <div className="pt-2">
            <Link href="/portal" className="cf-btn cf-btn--primary">
              Return to Member Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const roles = new Set((roleRows ?? []).map((row) => row.role));
  const leadEventIds = new Set(
    (eventRoleRows ?? []).map((row) => row.event_id),
  );
  const roleLookupFailed = Boolean(roleError || eventRoleError);

  const nowIso = new Date().toISOString();

  const [
    announcementResult,
    readResult,
    pollResult,
    eventResult,
    openPollsCountResult,
    activeAnnouncementIdsResult,
    draftAnnouncementsResult,
    archivedAnnouncementsResult,
  ] = await Promise.all([
    isPollsPage
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("announcements")
          .select(
            "id,event_id,title,message,created_at,updated_at,published_at,revision_number,priority,status,duration_preset,expires_at",
          )
          .eq("status", "active")
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
    supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("member_id", authData.user.id),
    !isPollsPage
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("announcement_polls")
          .select(
            "id,event_id,question,poll_type,created_at,closes_at,locked_at,revision_number",
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
    supabase
      .from("events")
      .select("id,title,archived_at")
      .order("starts_at", { ascending: false })
      .limit(500),
    // Fast count for open polls
    supabase
      .from("announcement_polls")
      .select("id", { count: "exact", head: true })
      .gt("closes_at", nowIso),
    // Active announcement IDs to compute unread count accurately on polls page
    !isPollsPage
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("announcements")
          .select("id")
          .eq("status", "active")
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .limit(50),
    isPollsPage
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("list_draft_announcements"),
    isPollsPage
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("list_archived_announcements"),
  ]);

  const announcements = (announcementResult.data ?? []) as AnnouncementRow[];
  const reads = new Set(
    (readResult.data ?? []).map((row) => row.announcement_id),
  );
  const draftRows = (draftAnnouncementsResult.data ??
    []) as DraftAnnouncementRow[];
  const archivedRows = (archivedAnnouncementsResult.data ??
    []) as ArchivedAnnouncementRow[];
  const polls = (pollResult.data ?? []) as PollRow[];
  const events = (eventResult.data ?? []) as EventRow[];
  const eventById = new Map(events.map((event) => [event.id, event]));

  const historyTargetIds = [
    ...announcements.map((announcement) => announcement.id),
    ...draftRows.map((draft) => draft.id),
  ];

  const [summaryResult, announcementHistoryResult, pollHistoryResult] =
    await Promise.all([
      isPollsPage
        ? supabase.rpc("get_announcement_poll_summary")
        : Promise.resolve({ data: [], error: null }),
      !isPollsPage && historyTargetIds.length > 0
        ? supabase
            .from("announcement_revisions")
            .select(
              "id,announcement_id,revision_number,title,message,priority,status,duration_preset,expires_at,edited_at,reason",
            )
            .in("announcement_id", historyTargetIds)
            .order("revision_number", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      isPollsPage && polls.length > 0
        ? supabase
            .from("announcement_poll_revisions")
            .select(
              "id,poll_id,revision_number,question,poll_type,options,closes_at,edited_at,reason",
            )
            .in(
              "poll_id",
              polls.map((poll) => poll.id),
            )
            .order("revision_number", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  const summaryRows = (summaryResult.data ?? []) as PollSummaryRow[];
  const announcementRevisions = (announcementHistoryResult.data ??
    []) as AnnouncementRevisionRow[];
  const pollRevisions = (pollHistoryResult.data ?? []) as PollRevisionRow[];
  const announcementsHistoryUnavailable = Boolean(
    announcementHistoryResult.error,
  );
  const pollsHistoryUnavailable = Boolean(pollHistoryResult.error);

  const announcementHistory = new Map<string, AnnouncementRevisionRow[]>();
  for (const revision of announcementRevisions) {
    const history = announcementHistory.get(revision.announcement_id) ?? [];
    history.push(revision);
    announcementHistory.set(revision.announcement_id, history);
  }

  const pollHistory = new Map<string, PollRevisionRow[]>();
  for (const revision of pollRevisions) {
    const history = pollHistory.get(revision.poll_id) ?? [];
    history.push(revision);
    pollHistory.set(revision.poll_id, history);
  }

  const summariesByPoll = new Map<string, PollSummaryRow[]>();
  for (const summary of summaryRows) {
    const options = summariesByPoll.get(summary.poll_id) ?? [];
    options.push(summary);
    summariesByPoll.set(summary.poll_id, options);
  }

  const pollSummaryUnavailable = Boolean(summaryResult.error);
  const pageAccess = getCommunicationsPageAccess({
    roles: [...roles],
    eventLeadIds: [...leadEventIds],
    activeEventIds: events
      .filter((event) => event.archived_at === null)
      .map((event) => event.id),
    roleLookupFailed,
  });
  const { globalPublisher } = pageAccess;
  const publishEventIds = new Set(pageAccess.publishEventIds);
  const publishEvents: EventOption[] = events
    .filter((event) => publishEventIds.has(event.id))
    .map((event) => ({
      id: event.id,
      title: event.title,
      archivedAt: event.archived_at,
    }));
  const canManageForEvent = pageAccess.canManageForEvent;
  const now = Date.now();

  const notice = params.notice ? notices[params.notice] : undefined;

  // Unread announcements calculation across active unexpired notices
  const activePollPageIds = (activeAnnouncementIdsResult.data ?? []) as Array<{
    id: string;
  }>;
  const unreadAnnouncementsCount = isPollsPage
    ? activePollPageIds.filter((a) => !reads.has(a.id)).length
    : announcements.filter((a) => !reads.has(a.id)).length;

  // Open polls calculation
  const openPollsCount =
    openPollsCountResult.count ??
    polls.filter((p) => new Date(p.closes_at).getTime() > now).length;

  const errorMessage =
    (isPollsPage
      ? Boolean(pollResult.error || eventResult.error)
      : Boolean(
          announcementResult.error || readResult.error || eventResult.error,
        )) || roleLookupFailed
      ? isPollsPage
        ? "Some member or poll data could not be loaded. Refresh the page to try again."
        : "Some member or announcement data could not be loaded. Refresh the page to try again."
      : undefined;

  const historyUnavailableMessage = isPollsPage
    ? pollsHistoryUnavailable
      ? "Poll revision history is unavailable. Poll edits are hidden until it can be checked."
      : undefined
    : announcementsHistoryUnavailable
      ? "Announcement revision history is unavailable. Announcement edits are hidden until it can be checked."
      : undefined;

  // Transform announcements to AnnouncementItem[]
  const mappedAnnouncements: AnnouncementItem[] = announcements.map(
    (announcement) => {
      const event = announcement.event_id
        ? eventById.get(announcement.event_id)
        : null;
      const isRead = reads.has(announcement.id);
      const canManage = canManageForEvent(
        announcement.event_id,
        !announcementsHistoryUnavailable,
      );
      const history = announcementHistory.get(announcement.id) ?? [];

      return {
        id: announcement.id,
        eventId: announcement.event_id,
        eventTitle:
          event?.title ?? (announcement.event_id ? "Event notice" : null),
        title: announcement.title,
        message: announcement.message,
        createdAt: announcement.created_at,
        updatedAt: announcement.updated_at,
        publishedAt: announcement.published_at,
        revisionNumber: announcement.revision_number,
        priority: announcement.priority,
        status: announcement.status,
        durationPreset: announcement.duration_preset,
        expiresAt: announcement.expires_at,
        isRead,
        readStatusUnavailable: Boolean(readResult.error),
        canManage,
        revisions: history.map((h) => ({
          id: h.id,
          revisionNumber: h.revision_number,
          title: h.title,
          message: h.message,
          priority: h.priority,
          status: h.status,
          durationPreset: h.duration_preset,
          expiresAt: h.expires_at,
          editedAt: h.edited_at,
          reason: h.reason,
        })),
      };
    },
  );

  const archivedActorIds = Array.from(
    new Set(
      archivedRows
        .map((row) => row.archived_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const archivedActorResult =
    !isPollsPage && archivedActorIds.length > 0
      ? await supabase
          .from("member_profiles")
          .select("id,full_name")
          .in("id", archivedActorIds)
      : { data: [], error: null };
  const actorNameById = new Map(
    (
      (archivedActorResult.data ?? []) as Array<{
        id: string;
        full_name: string | null;
      }>
    ).map((row) => [row.id, row.full_name ?? "Club Officer"]),
  );

  const mappedDrafts: AnnouncementDraftItem[] = draftRows.map((draft) => {
    const event = draft.event_id ? eventById.get(draft.event_id) : null;
    return {
      id: draft.id,
      eventId: draft.event_id,
      eventTitle: event?.title ?? (draft.event_id ? "Event notice" : null),
      title: draft.title,
      message: draft.message,
      priority: draft.priority,
      durationPreset: draft.duration_preset,
      expiresAt: draft.expires_at,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
      revisionNumber: draft.revision_number,
      canManage: canManageForEvent(
        draft.event_id,
        !announcementsHistoryUnavailable,
      ),
    };
  });

  const mappedArchived: AnnouncementArchiveItem[] = archivedRows.map(
    (archived) => {
      const event = archived.event_id ? eventById.get(archived.event_id) : null;
      return {
        id: archived.id,
        eventId: archived.event_id,
        eventTitle: event?.title ?? (archived.event_id ? "Event notice" : null),
        title: archived.title,
        message: archived.message,
        priority: archived.priority,
        durationPreset: archived.duration_preset,
        publishedAt: archived.published_at,
        expiresAt: archived.expires_at,
        archivedAt: archived.archived_at,
        archivedByName: archived.archived_by
          ? (actorNameById.get(archived.archived_by) ?? "Authorized officer")
          : null,
        archiveReason: archived.archive_reason,
        purgeAfter: archived.purge_after,
        createdAt: archived.created_at,
        updatedAt: archived.updated_at,
        revisionNumber: archived.revision_number,
        canManage:
          archived.event_id === null
            ? globalPublisher
            : canManageForEvent(archived.event_id, true),
      };
    },
  );

  // Transform polls to PollItem[]
  const mappedPolls: PollItem[] = polls.map((poll) => {
    const event = poll.event_id ? eventById.get(poll.event_id) : null;
    const options = summariesByPoll.get(poll.id) ?? [];
    const open = new Date(poll.closes_at).getTime() > now;
    const pollPresentation = getPollSummaryPresentation(
      options,
      pollSummaryUnavailable,
      open,
    );
    const { hasVoted, resultsVisible, totalVotes, state } = pollPresentation;
    const canManage =
      canManageForEvent(poll.event_id, !pollsHistoryUnavailable) &&
      poll.locked_at === null &&
      open;
    const history = pollHistory.get(poll.id) ?? [];
    const durationMinutes = Math.round(
      (new Date(poll.closes_at).getTime() -
        new Date(poll.created_at).getTime()) /
        60_000,
    );
    const closingSoon = isClosingSoon(poll, now);

    return {
      id: poll.id,
      eventId: poll.event_id,
      eventTitle: event?.title ?? (poll.event_id ? "Event poll" : null),
      question: poll.question,
      pollType: poll.poll_type,
      createdAt: poll.created_at,
      closesAt: poll.closes_at,
      lockedAt: poll.locked_at,
      revisionNumber: poll.revision_number,
      options: options
        .slice()
        .sort((a, b) => a.option_position - b.option_position)
        .map((opt) => ({
          optionId: opt.option_id,
          position: opt.option_position,
          label: opt.label,
          votes: opt.votes,
          hasVoted: opt.has_voted,
          resultsVisible: opt.results_visible,
        })),
      hasVoted,
      resultsVisible,
      totalVotes,
      state: state as "unavailable" | "released" | "hidden" | "loading",
      isOpen: open,
      isClosingSoon: closingSoon,
      canManage,
      durationMinutes,
      revisions: history.map((h) => ({
        id: h.id,
        revisionNumber: h.revision_number,
        question: h.question,
        pollType: h.poll_type,
        options: h.options,
        closesAt: h.closes_at,
        editedAt: h.edited_at,
        reason: h.reason,
      })),
    };
  });

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {!isPollsPage ? (
        <AnnouncementsPageView
          announcements={mappedAnnouncements}
          drafts={mappedDrafts}
          archivedAnnouncements={mappedArchived}
          unreadAnnouncementsCount={unreadAnnouncementsCount}
          openPollsCount={openPollsCount}
          globalPublisher={globalPublisher}
          publishEvents={publishEvents}
          notice={notice}
          errorMessage={errorMessage}
          historyUnavailableMessage={historyUnavailableMessage}
        />
      ) : (
        <PollsPageView
          polls={mappedPolls}
          unreadAnnouncementsCount={unreadAnnouncementsCount}
          openPollsCount={openPollsCount}
          globalPublisher={globalPublisher}
          publishEvents={publishEvents}
          notice={notice}
          errorMessage={errorMessage}
          historyUnavailableMessage={historyUnavailableMessage}
          pollSummaryUnavailable={pollSummaryUnavailable}
        />
      )}
    </main>
  );
}
