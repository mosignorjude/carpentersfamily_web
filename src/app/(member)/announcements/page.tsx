import Link from "next/link";
import { redirect } from "next/navigation";
import {
  castAnnouncementPollVoteAction,
  createAnnouncementAction,
  createAnnouncementPollAction,
  markAnnouncementReadAction,
  updateAnnouncementAction,
  updateAnnouncementPollAction,
} from "@/app/actions";
import {
  getCommunicationsPageAccess,
  getPollSummaryPresentation,
} from "@/lib/communications-page-access.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PollLiveRefresh from "./poll-live-refresh";

type AnnouncementRow = {
  id: string;
  event_id: string | null;
  title: string;
  message: string;
  created_at: string;
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
  updated: "The announcement edit and its reason were saved.",
  read: "Your private read marker was saved.",
  "poll-created": "The poll is open for voting.",
  "poll-updated": "The poll edit and its reason were saved.",
  voted: "Your final vote was recorded.",
  "invalid-request": "Check the fields and try again.",
  denied: "You are not allowed to make that change.",
  "operation-failed":
    "The request could not be saved. It may be outside your permissions or the poll may have closed.",
};

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

function dateLabel(value: string) {
  return dateFormatter.format(new Date(value));
}

function isClosingSoon(poll: PollRow, now: number) {
  const startsAt = new Date(poll.created_at).getTime();
  const closesAt = new Date(poll.closes_at).getTime();
  return now < closesAt && now >= startsAt + (closesAt - startsAt) * 0.75;
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Announcements unavailable</h1>
          <p>Authentication is not configured in this environment.</p>
        </section>
      </main>
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
      <main className="shell">
        <section className="panel">
          <h1>Access denied</h1>
          <p>Announcements and polls are available to active members.</p>
          <Link href="/">Return to the member portal</Link>
        </section>
      </main>
    );
  }

  const roles = new Set((roleRows ?? []).map((row) => row.role));
  const leadEventIds = new Set(
    (eventRoleRows ?? []).map((row) => row.event_id),
  );
  const roleLookupFailed = Boolean(roleError || eventRoleError);

  const [announcementResult, readResult, pollResult, eventResult] =
    await Promise.all([
      supabase
        .from("announcements")
        .select(
          "id,event_id,title,message,created_at,updated_at,revision_number",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50),
      supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("member_id", authData.user.id),
      supabase
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
    ]);

  const announcements = (announcementResult.data ?? []) as AnnouncementRow[];
  const reads = new Set(
    (readResult.data ?? []).map((row) => row.announcement_id),
  );
  const polls = (pollResult.data ?? []) as PollRow[];
  const events = (eventResult.data ?? []) as EventRow[];
  const eventById = new Map(events.map((event) => [event.id, event]));

  const [summaryResult, announcementHistoryResult, pollHistoryResult] =
    await Promise.all([
      supabase.rpc("get_announcement_poll_summary"),
      announcements.length > 0
        ? supabase
            .from("announcement_revisions")
            .select(
              "id,announcement_id,revision_number,title,message,edited_at,reason",
            )
            .in(
              "announcement_id",
              announcements.map((announcement) => announcement.id),
            )
            .order("revision_number", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      polls.length > 0
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

  const dataUnavailable = Boolean(
    announcementResult.error ||
      readResult.error ||
      pollResult.error ||
      eventResult.error,
  );
  const pollSummaryUnavailable = Boolean(summaryResult.error);
  const pageAccess = getCommunicationsPageAccess({
    roles: [...roles],
    eventLeadIds: [...leadEventIds],
    activeEventIds: events
      .filter((event) => event.archived_at === null)
      .map((event) => event.id),
    roleLookupFailed,
  });
  const { globalPublisher, canPublish } = pageAccess;
  const publishEventIds = new Set(pageAccess.publishEventIds);
  const publishEvents = events.filter((event) => publishEventIds.has(event.id));
  const canManageForEvent = pageAccess.canManageForEvent;
  const now = Date.now();
  const hasOpenPolls = polls.some(
    (poll) => new Date(poll.closes_at).getTime() > now,
  );
  const notice = params.notice ? notices[params.notice] : undefined;

  return (
    <main className="shell communications-shell">
      <section className="panel communications-panel">
        <header className="communications-header member-page-header">
          <div>
            <p className="eyebrow">Member communications</p>
            <h1>Announcements &amp; polls</h1>
            <p>
              Club notices and event updates for active members. Read markers
              are private to you, and individual poll choices are never shown.
            </p>
          </div>
        </header>

        <aside className="communications-privacy-note">
          <strong>
            Read markers are personal; poll choices are anonymous.
          </strong>
          <span>
            Your announcement read status is visible only to you. Poll totals
            stay hidden while voting is open and are released after closing only
            when at least five votes have been recorded.
          </span>
        </aside>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        {dataUnavailable || roleLookupFailed ? (
          <p className="notice" role="alert">
            Some member or announcement data could not be loaded. Refresh the
            page to try again.
          </p>
        ) : null}
        {announcementsHistoryUnavailable || pollsHistoryUnavailable ? (
          <p className="notice" role="status">
            {announcementsHistoryUnavailable && pollsHistoryUnavailable
              ? "Revision history is unavailable. Announcement and poll edit controls are hidden until it can be checked."
              : announcementsHistoryUnavailable
                ? "Announcement revision history is unavailable. Announcement edits are hidden until it can be checked."
                : "Poll revision history is unavailable. Poll edits are hidden until it can be checked."}
          </p>
        ) : null}

        {canPublish &&
        !roleLookupFailed &&
        (globalPublisher || publishEvents.length > 0) ? (
          <details className="communications-compose">
            <summary className="communications-compose-toggle">
              <span>
                <strong>Publish an announcement or poll</strong>
                <span className="muted">
                  Admin and Executive may publish club-wide. Event Leads may
                  publish only to assigned active events.
                </span>
              </span>
              <span className="communications-compose-action">
                <span className="communications-open-text">Open tools</span>
                <span className="communications-close-text">Close tools</span>
              </span>
            </summary>
            <div className="communications-compose-grid">
              <form
                action={createAnnouncementAction}
                className="form-stack communications-form"
              >
                <h2>Post an announcement</h2>
                <label>
                  Audience
                  <select
                    defaultValue={
                      globalPublisher ? "" : (publishEvents[0]?.id ?? "")
                    }
                    name="event_id"
                  >
                    {globalPublisher ? (
                      <option value="">Club-wide</option>
                    ) : null}
                    {publishEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Title
                  <input maxLength={160} name="title" required />
                </label>
                <label>
                  Message
                  <textarea
                    maxLength={10_000}
                    name="message"
                    rows={5}
                    required
                  />
                </label>
                <button type="submit">Post announcement</button>
              </form>

              <form
                action={createAnnouncementPollAction}
                className="form-stack communications-form"
              >
                <h2>Create a poll</h2>
                <label>
                  Audience
                  <select
                    defaultValue={
                      globalPublisher ? "" : (publishEvents[0]?.id ?? "")
                    }
                    name="event_id"
                  >
                    {globalPublisher ? (
                      <option value="">Club-wide</option>
                    ) : null}
                    {publishEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Question
                  <input maxLength={300} name="question" required />
                </label>
                <label>
                  Poll type
                  <select defaultValue="yes_no" name="poll_type">
                    <option value="yes_no">Yes / No</option>
                    <option value="multiple_choice">Multiple choice</option>
                  </select>
                </label>
                <label>
                  Choices (one per line; multiple-choice polls only)
                  <textarea maxLength={1000} name="options" rows={3} />
                </label>
                <label>
                  Duration in minutes (5 minutes to 30 days)
                  <input
                    defaultValue={1440}
                    max={43_200}
                    min={5}
                    name="duration_minutes"
                    required
                    type="number"
                  />
                </label>
                <button type="submit">Open poll</button>
              </form>
            </div>
          </details>
        ) : (
          <p className="muted communications-permissions">
            Active members can read and vote. Admin and Executive can publish
            club-wide; assigned Event Leads can publish within their event
            scope.
          </p>
        )}

        <section
          className="communications-section"
          aria-labelledby="announcements-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Newest first</p>
              <h2 id="announcements-heading">Announcements</h2>
            </div>
          </div>
          {announcements.length ? (
            <div className="communications-list">
              {announcements.map((announcement) => {
                const event = announcement.event_id
                  ? eventById.get(announcement.event_id)
                  : null;
                const isRead = reads.has(announcement.id);
                const canManage = canManageForEvent(
                  announcement.event_id,
                  !announcementsHistoryUnavailable,
                );
                const history = announcementHistory.get(announcement.id) ?? [];
                return (
                  <article className="communication-card" key={announcement.id}>
                    <div className="communication-heading">
                      <div className="communication-title">
                        <p className="communication-audience">
                          {event?.title ??
                            (announcement.event_id
                              ? "Event announcement"
                              : "Club-wide")}
                        </p>
                        <h3>{announcement.title}</h3>
                      </div>
                      <div className="communication-card-meta">
                        <time dateTime={announcement.created_at}>
                          {dateLabel(announcement.created_at)}
                        </time>
                        <span
                          className={`status-pill ${readResult.error ? "status-read-unavailable" : isRead ? "status-read" : "status-unread"}`}
                        >
                          {readResult.error
                            ? "Read status unavailable"
                            : isRead
                              ? "Read by you"
                              : "Unread for you"}
                        </span>
                      </div>
                    </div>
                    <p className="communication-message">
                      {announcement.message}
                    </p>
                    <div className="communication-actions">
                      {!readResult.error && !isRead ? (
                        <form action={markAnnouncementReadAction}>
                          <input
                            name="announcement_id"
                            type="hidden"
                            value={announcement.id}
                          />
                          <button className="button-secondary" type="submit">
                            Mark as read
                          </button>
                        </form>
                      ) : null}
                      {history.length > 0 ? (
                        <details className="communication-history">
                          <summary>Revision history ({history.length})</summary>
                          <ol>
                            {history.map((revision) => (
                              <li key={revision.id}>
                                <strong>
                                  Revision {revision.revision_number}
                                </strong>
                                <time dateTime={revision.edited_at}>
                                  {dateLabel(revision.edited_at)}
                                </time>
                                <p>{revision.reason}</p>
                                <h4>{revision.title}</h4>
                                <p className="communication-message">
                                  {revision.message}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                      {canManage ? (
                        <details className="communication-edit">
                          <summary>Edit announcement</summary>
                          <form
                            action={updateAnnouncementAction}
                            className="form-stack"
                          >
                            <input
                              name="announcement_id"
                              type="hidden"
                              value={announcement.id}
                            />
                            <label>
                              Title
                              <input
                                defaultValue={announcement.title}
                                maxLength={160}
                                name="title"
                                required
                              />
                            </label>
                            <label>
                              Message
                              <textarea
                                defaultValue={announcement.message}
                                maxLength={10_000}
                                name="message"
                                rows={5}
                                required
                              />
                            </label>
                            <label>
                              Reason for this edit
                              <input maxLength={500} name="reason" required />
                            </label>
                            <button type="submit">Save edit</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : announcementResult.error ? (
            <p className="empty-state" role="alert">
              Announcements could not be loaded. Refresh the page to try again.
            </p>
          ) : (
            <p className="empty-state">There are no announcements yet.</p>
          )}
        </section>

        <section
          className="communications-section"
          aria-labelledby="polls-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Anonymous and final</p>
              <h2 id="polls-heading">Polls</h2>
            </div>
          </div>
          <PollLiveRefresh activePolls={hasOpenPolls} />
          {pollSummaryUnavailable ? (
            <p className="notice" role="alert">
              Poll totals are temporarily unavailable.
            </p>
          ) : null}
          {polls.length ? (
            <div className="communications-list">
              {polls.map((poll) => {
                const event = poll.event_id
                  ? eventById.get(poll.event_id)
                  : null;
                const options = summariesByPoll.get(poll.id) ?? [];
                const open = new Date(poll.closes_at).getTime() > now;
                const pollPresentation = getPollSummaryPresentation(
                  options,
                  pollSummaryUnavailable,
                  open,
                );
                const { hasVoted, resultsVisible, totalVotes } =
                  pollPresentation;
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
                return (
                  <article
                    className="communication-card poll-card"
                    key={poll.id}
                  >
                    <div className="communication-heading">
                      <div>
                        <p className="communication-audience">
                          {event?.title ??
                            (poll.event_id ? "Event poll" : "Club-wide poll")}
                        </p>
                        <h3>{poll.question}</h3>
                      </div>
                      <span
                        className={`status-pill ${open ? "status-open" : "status-closed"}`}
                      >
                        {open ? "Open for voting" : "Voting closed"}
                      </span>
                    </div>
                    <p className="muted communication-poll-meta">
                      {poll.poll_type === "yes_no"
                        ? "Yes / No"
                        : "Multiple choice"}{" "}
                      ·{" "}
                      <time dateTime={poll.closes_at}>
                        {open ? "Closes" : "Closed"} {dateLabel(poll.closes_at)}
                      </time>
                      {totalVotes !== null
                        ? ` · ${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}`
                        : ""}
                    </p>
                    {open && isClosingSoon(poll, now) ? (
                      <p className="poll-closing-reminder" role="status">
                        Closing soon: this poll has passed 75% of its voting
                        period.
                      </p>
                    ) : null}
                    {resultsVisible ? (
                      <div className="poll-final-results">
                        <h4 className="poll-results-heading">Final results</h4>
                        <ol className="poll-results">
                          {options
                            .slice()
                            .sort(
                              (left, right) =>
                                left.option_position - right.option_position,
                            )
                            .map((option) => (
                              <li key={option.option_id}>
                                <div className="poll-result-label">
                                  <span>{option.label}</span>
                                  <strong>{option.votes ?? 0}</strong>
                                </div>
                                <progress
                                  aria-label={`${option.votes ?? 0} votes for ${option.label}`}
                                  max={Math.max(totalVotes ?? 0, 1)}
                                  value={option.votes ?? 0}
                                />
                              </li>
                            ))}
                        </ol>
                      </div>
                    ) : pollSummaryUnavailable ? (
                      <p className="muted poll-result-state" role="alert">
                        Poll information is temporarily unavailable. Refresh the
                        page to try again.
                      </p>
                    ) : options.length ? (
                      <p className="muted poll-result-state">
                        {open
                          ? "Live totals are hidden while voting is open."
                          : "Final totals are not released for this poll under the privacy threshold."}
                      </p>
                    ) : (
                      <p className="muted poll-result-state">
                        Poll choices are loading.
                      </p>
                    )}
                    <p className="muted poll-privacy-note">
                      {pollSummaryUnavailable
                        ? "Poll choices and totals are temporarily unavailable. Individual ballot choices are never shown."
                        : resultsVisible
                          ? "Individual choices are never shown. The totals below are anonymous aggregate results."
                          : open
                            ? "Individual choices and running totals stay hidden while voting is open."
                            : "Individual choices are never shown. Final totals stay hidden when the privacy threshold is not met."}
                    </p>
                    {open &&
                    !hasVoted &&
                    options.length > 0 &&
                    !pollSummaryUnavailable ? (
                      <form
                        action={castAnnouncementPollVoteAction}
                        className="form-stack poll-vote-form"
                      >
                        <input name="poll_id" type="hidden" value={poll.id} />
                        <fieldset>
                          <legend>Choose one option. Votes are final.</legend>
                          {options
                            .slice()
                            .sort(
                              (left, right) =>
                                left.option_position - right.option_position,
                            )
                            .map((option) => (
                              <label
                                className="poll-choice"
                                key={option.option_id}
                              >
                                <input
                                  name="option_id"
                                  required
                                  type="radio"
                                  value={option.option_id}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                        </fieldset>
                        <label className="poll-confirmation">
                          <input
                            name="confirm_final_vote"
                            required
                            type="checkbox"
                            value="yes"
                          />
                          <span>I understand I cannot change this vote.</span>
                        </label>
                        <button type="submit">Submit final vote</button>
                      </form>
                    ) : null}
                    {hasVoted ? (
                      <p className="status-pill">Your vote is recorded</p>
                    ) : null}
                    {!open ? <p className="muted">Voting is closed.</p> : null}
                    {history.length > 0 ? (
                      <details className="communication-history">
                        <summary>
                          Configuration history ({history.length})
                        </summary>
                        <ol>
                          {history.map((revision) => (
                            <li key={revision.id}>
                              <strong>
                                Revision {revision.revision_number}
                              </strong>
                              <time dateTime={revision.edited_at}>
                                {dateLabel(revision.edited_at)}
                              </time>
                              <p>{revision.reason}</p>
                              <p>{revision.question}</p>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    {canManage ? (
                      <details className="communication-edit">
                        <summary>Edit before voting starts</summary>
                        <form
                          action={updateAnnouncementPollAction}
                          className="form-stack"
                        >
                          <input name="poll_id" type="hidden" value={poll.id} />
                          <label>
                            Question
                            <input
                              defaultValue={poll.question}
                              maxLength={300}
                              name="question"
                              required
                            />
                          </label>
                          <label>
                            Poll type
                            <select
                              defaultValue={poll.poll_type}
                              name="poll_type"
                            >
                              <option value="yes_no">Yes / No</option>
                              <option value="multiple_choice">
                                Multiple choice
                              </option>
                            </select>
                          </label>
                          <label>
                            Choices (one per line; multiple-choice polls only)
                            <textarea
                              defaultValue={
                                poll.poll_type === "multiple_choice"
                                  ? options
                                      .map((option) => option.label)
                                      .join("\n")
                                  : ""
                              }
                              maxLength={1000}
                              name="options"
                              rows={3}
                            />
                          </label>
                          <label>
                            Total duration in minutes
                            <input
                              defaultValue={durationMinutes}
                              max={43_200}
                              min={5}
                              name="duration_minutes"
                              required
                              type="number"
                            />
                          </label>
                          <label>
                            Reason for this edit
                            <input maxLength={500} name="reason" required />
                          </label>
                          <button type="submit">Save poll edit</button>
                        </form>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : pollResult.error ? (
            <p className="empty-state" role="alert">
              Polls could not be loaded. Refresh the page to try again.
            </p>
          ) : (
            <p className="empty-state">There are no polls yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
