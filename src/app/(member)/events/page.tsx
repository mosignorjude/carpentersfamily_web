import Link from "next/link";
import { redirect } from "next/navigation";
import {
  archiveEventAction,
  assignEventRoleAction,
  createEventAction,
  reopenEventAction,
  revokeEventRoleAction,
  setEventBudgetAction,
  setEventStatusAction,
  updateEventDetailsAction,
} from "@/app/actions";
import { getEventCardAccess } from "@/lib/event-card-access.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  location: string;
  description: string | null;
  minutes_enabled: boolean;
  attendance_enabled: boolean;
  budget_enabled: boolean;
  income_enabled: boolean;
  expenses_enabled: boolean;
  ticketing_enabled: boolean;
  status: string;
  status_changed_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type EventRoleRow = {
  event_id: string;
  member_id: string;
  role: string;
  assigned_at: string;
  revoked_at: string | null;
};

type MemberRow = { id: string; full_name: string; username: string };
type AllocationRow = {
  event_id: string;
  position: number;
  allocation_name: string;
  amount_ngn: number;
};
type BudgetRow = { event_id: string; total_ngn: number };

const noticeText: Record<string, string> = {
  created: "The event was created.",
  updated: "The event details were updated.",
  "role-saved": "The event staffing change was saved.",
  "budget-saved": "The event budget was saved.",
  completed: "The event was marked completed.",
  cancelled: "The event was cancelled.",
  reopened: "The event was reopened.",
  archived: "The event was moved to retained archive.",
  denied: "You are not allowed to make that change.",
  "invalid-request": "Check the event details and try again.",
  "operation-failed": "The event change could not be saved.",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "full",
  timeStyle: "short",
});

const moneyFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function dateTimeLocalValue(value: string) {
  const date = new Date(new Date(value).getTime() + 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

function roleLabel(role: string) {
  if (role === "lead") return "Event lead";
  if (role === "assistant") return "Event assistant";
  return "Committee";
}

function featureList(event: EventRow) {
  const features: string[] = [];
  if (event.minutes_enabled) features.push("Minutes");
  if (event.attendance_enabled) features.push("Attendance");
  if (event.budget_enabled) features.push("Budget");
  if (event.income_enabled) features.push("Revenue");
  if (event.expenses_enabled) features.push("Expenses");
  if (event.ticketing_enabled) features.push("Ticket tiers");
  return features;
}

function EventCard({
  event,
  roles,
  eventRoles,
  staff,
  members,
  budget,
  allocations,
  budgetReadError,
  archivedGroup = false,
}: {
  event: EventRow;
  roles: Set<string>;
  eventRoles: Set<string>;
  staff: EventRoleRow[];
  members: Map<string, MemberRow>;
  budget?: BudgetRow;
  allocations: AllocationRow[];
  budgetReadError: boolean;
  archivedGroup?: boolean;
}) {
  const {
    isManager,
    canEdit,
    canSetStatus,
    canReopen,
    mutable,
    showBudgetEditor,
  } = getEventCardAccess({
    roles,
    eventRoles,
    status: event.status,
    archivedAt: event.archived_at,
    archivedGroup,
    budgetReadError,
  });
  const eventStaff = staff.filter(
    (assignment) =>
      assignment.event_id === event.id && assignment.revoked_at === null,
  );
  const allocationInputs = [
    ...allocations.map((allocation) => ({
      key: [event.id, String(allocation.position)].join("-"),
      allocation,
    })),
    ...Array.from(
      { length: Math.max(0, 5 - allocations.length) },
      (_unused, index) => ({
        key: ["new-allocation", event.id, String(index + 1)].join("-"),
        allocation: undefined,
      }),
    ),
  ];
  const titleId = `event-title-${event.id}`;
  const enabledFeatures = featureList(event);
  const isRetainedArchive = Boolean(event.archived_at || archivedGroup);
  const visibleStatus = isRetainedArchive
    ? "Archived"
    : event.status === "scheduled"
      ? "Scheduled"
      : event.status === "completed"
        ? "Completed"
        : event.status === "cancelled"
          ? "Cancelled"
          : "Status unavailable";
  const cardState = isRetainedArchive
    ? "retained"
    : event.status === "scheduled"
      ? "scheduled"
      : "locked";

  return (
    <article
      className={`event-card event-card-${cardState}`}
      aria-labelledby={titleId}
    >
      <header className="event-card-heading">
        <div>
          <p className="eyebrow">{event.event_type}</p>
          <h3 id={titleId}>{event.title}</h3>
          <p className="muted">
            <time dateTime={event.starts_at}>
              {dateTimeFormatter.format(new Date(event.starts_at))} WAT
            </time>
          </p>
        </div>
        <span
          className={`status-pill event-status-pill ${isRetainedArchive ? "archived" : event.status}`}
        >
          {visibleStatus}
        </span>
      </header>

      {event.archived_at ? (
        <p className="event-readonly-notice" role="note">
          This event is retained in the archive. Changes are locked and its
          record remains available for reporting.
        </p>
      ) : event.status === "completed" || event.status === "cancelled" ? (
        <p className="event-readonly-notice" role="note">
          This event is {event.status} and locked. Planning changes are
          read-only; only an Admin or Backup Admin can reopen it.
        </p>
      ) : archivedGroup ? (
        <p className="event-readonly-notice" role="note">
          This older event is shown in the retained archive. Planning changes
          are read-only.
        </p>
      ) : null}

      <dl className="event-details">
        <div>
          <dt>Location</dt>
          <dd>{event.location}</dd>
        </div>
        {event.description ? (
          <div>
            <dt>Details</dt>
            <dd className="event-description">{event.description}</dd>
          </div>
        ) : null}
      </dl>

      <section className="event-section" aria-label="Event features">
        <h4>Features</h4>
        {enabledFeatures.length ? (
          <ul className="event-feature-list">
            {enabledFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No optional features enabled.</p>
        )}
        <p className="muted">
          Feature settings are fixed at creation. To change them, archive this
          record with a reason and create a replacement event. Its history
          remains available.
        </p>
      </section>

      <p className="event-finance-link">
        <Link href={`/events/${event.id}/finance`}>
          View event finances and ticket sales
        </Link>
      </p>
      {event.minutes_enabled || event.attendance_enabled ? (
        <p className="event-finance-link">
          <Link href={`/events/${event.id}/attendance`}>
            View meeting minutes and attendance
          </Link>
        </p>
      ) : null}

      <section className="event-section" aria-label="Event staffing">
        <h4>Staffing</h4>
        {eventStaff.length ? (
          <ul className="event-staff-list">
            {eventStaff.map((assignment) => {
              const member = members.get(assignment.member_id);
              return (
                <li key={assignment.event_id + assignment.member_id}>
                  <span>{roleLabel(assignment.role)}</span>
                  <strong>
                    {member
                      ? `${member.full_name} (@${member.username})`
                      : "Former member"}
                  </strong>
                  {isManager && mutable ? (
                    <form
                      action={revokeEventRoleAction}
                      className="inline-form"
                    >
                      <input name="event_id" type="hidden" value={event.id} />
                      <input
                        name="member_id"
                        type="hidden"
                        value={assignment.member_id}
                      />
                      <label className="inline-label">
                        Reason
                        <input maxLength={500} name="reason" required />
                      </label>
                      <button className="button-secondary" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No event roles are assigned.</p>
        )}

        {isManager && mutable ? (
          <form
            action={assignEventRoleAction}
            className="form-stack event-form"
          >
            <input name="event_id" type="hidden" value={event.id} />
            <label>
              Active member
              <select name="member_id" required defaultValue="">
                <option disabled value="">
                  Select a member
                </option>
                {Array.from(members.values()).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} (@{member.username})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event role
              <select name="event_role" required defaultValue="lead">
                <option value="lead">Lead</option>
                <option value="assistant">Assistant</option>
                <option value="committee">Committee</option>
              </select>
            </label>
            <label>
              Reason for change
              <input maxLength={500} name="reason" required />
            </label>
            <button type="submit">Assign event role</button>
          </form>
        ) : null}
      </section>

      {event.budget_enabled ? (
        <section className="event-section" aria-label="Event budget">
          <h4>Budget</h4>
          {budgetReadError ? (
            <p className="event-budget-unavailable" role="status">
              Budget details could not be loaded. Budget changes are unavailable
              until the data loads successfully.
            </p>
          ) : budget ? (
            <>
              <p>
                Total:{" "}
                <strong>{moneyFormatter.format(budget.total_ngn)}</strong>
              </p>
              <ul className="event-budget-list">
                {allocations.map((allocation) => (
                  <li key={allocation.event_id + allocation.position}>
                    <span>{allocation.allocation_name}</span>
                    <strong>
                      {moneyFormatter.format(allocation.amount_ngn)}
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">No budget has been recorded.</p>
          )}

          {showBudgetEditor ? (
            <form
              action={setEventBudgetAction}
              className="form-stack event-form"
            >
              <input name="event_id" type="hidden" value={event.id} />
              <label>
                Budget total (NGN)
                <input
                  defaultValue={budget?.total_ngn ?? ""}
                  max={1_000_000_000_000}
                  min={1}
                  name="total_ngn"
                  required
                  step={1}
                  type="number"
                />
              </label>
              <fieldset className="allocation-fieldset">
                <legend>Named allocations</legend>
                {allocationInputs.map(({ key, allocation }) => (
                  <div className="allocation-input-row" key={key}>
                    <label>
                      Allocation
                      <input
                        defaultValue={allocation?.allocation_name ?? ""}
                        maxLength={80}
                        name="allocation_name"
                      />
                    </label>
                    <label>
                      Amount (NGN)
                      <input
                        defaultValue={allocation?.amount_ngn ?? ""}
                        max={1_000_000_000_000}
                        min={1}
                        name="allocation_amount_ngn"
                        step={1}
                        type="number"
                      />
                    </label>
                  </div>
                ))}
              </fieldset>
              <p className="muted">
                Allocation amounts must add up exactly to the total. A reason is
                retained with every budget revision.
              </p>
              <label>
                Reason
                <input maxLength={500} name="reason" required />
              </label>
              <button type="submit">
                {budget ? "Save budget revision" : "Save budget"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {canEdit && mutable ? (
        <details className="event-edit">
          <summary>Edit event details</summary>
          <form
            action={updateEventDetailsAction}
            className="form-stack event-form"
          >
            <input name="event_id" type="hidden" value={event.id} />
            <label>
              Event title
              <input
                defaultValue={event.title}
                maxLength={120}
                name="title"
                required
              />
            </label>
            <label>
              Date and time (WAT)
              <input
                defaultValue={dateTimeLocalValue(event.starts_at)}
                name="starts_at"
                required
                type="datetime-local"
              />
            </label>
            <label>
              Location
              <input
                defaultValue={event.location}
                maxLength={200}
                name="location"
                required
              />
            </label>
            <label>
              Details
              <textarea
                defaultValue={event.description ?? ""}
                maxLength={2000}
                name="description"
                rows={3}
              />
            </label>
            <label>
              Reason for change
              <input maxLength={500} name="reason" required />
            </label>
            <button className="button-secondary" type="submit">
              Save event details
            </button>
          </form>
        </details>
      ) : null}

      {canSetStatus && mutable ? (
        <section className="event-section event-lifecycle">
          <h4>Event status</h4>
          <p className="muted">
            Completing or cancelling locks event details and budget. Only an
            Admin or Backup Admin can reopen it.
          </p>
          <div className="event-action-grid">
            <form
              action={setEventStatusAction}
              className="form-stack event-form"
            >
              <input name="event_id" type="hidden" value={event.id} />
              <input name="status" type="hidden" value="completed" />
              <label>
                Reason
                <input maxLength={500} name="reason" required />
              </label>
              <label className="confirm-label">
                <input name="confirm" required type="checkbox" value="yes" />
                Confirm completion
              </label>
              <button type="submit">Mark completed</button>
            </form>
            <form
              action={setEventStatusAction}
              className="form-stack event-form"
            >
              <input name="event_id" type="hidden" value={event.id} />
              <input name="status" type="hidden" value="cancelled" />
              <label>
                Reason
                <input maxLength={500} name="reason" required />
              </label>
              <label className="confirm-label">
                <input name="confirm" required type="checkbox" value="yes" />
                Confirm cancellation
              </label>
              <button className="button-danger" type="submit">
                Cancel event
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {canReopen &&
      !event.archived_at &&
      (event.status === "completed" || event.status === "cancelled") ? (
        <section className="event-section event-lifecycle">
          <h4>Reopen this event</h4>
          <p className="muted">
            Reopening is restricted to an Admin or Backup Admin and is written
            to audit history.
          </p>
          <form action={reopenEventAction} className="form-stack event-form">
            <input name="event_id" type="hidden" value={event.id} />
            <label>
              Reason
              <input maxLength={500} name="reason" required />
            </label>
            <label className="confirm-label">
              <input name="confirm" required type="checkbox" value="yes" />
              Confirm reopening
            </label>
            <button className="button-secondary" type="submit">
              Reopen event
            </button>
          </form>
        </section>
      ) : null}

      {isManager && !event.archived_at ? (
        <details className="event-edit">
          <summary>Move to retained archive</summary>
          <p className="muted">
            This hides the event from the current list. Event details, staffing,
            budget and future linked financial history remain retained and
            visible to active members.
          </p>
          <form action={archiveEventAction} className="form-stack event-form">
            <input name="event_id" type="hidden" value={event.id} />
            <label>
              Archive reason
              <input maxLength={500} name="reason" required />
            </label>
            <label className="confirm-label">
              <input name="confirm" required type="checkbox" value="yes" />
              Confirm retained archive
            </label>
            <button className="button-secondary" type="submit">
              Archive event
            </button>
          </form>
        </details>
      ) : null}

      {archivedGroup && !event.archived_at ? (
        <p className="muted">
          This older past event is shown in the retained archive for reporting.
        </p>
      ) : null}
    </article>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/?notice=configuration");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");
  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") redirect("/");

  const [
    { data: eventData, error: eventsError },
    { data: roleData, error: rolesError },
    { data: clubRoles, error: clubRolesError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id,title,event_type,starts_at,location,description,minutes_enabled,attendance_enabled,budget_enabled,income_enabled,expenses_enabled,ticketing_enabled,status,status_changed_at,archived_at,created_at,updated_at",
      )
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1000),
    supabase
      .from("event_role_assignments")
      .select("event_id,member_id,role,assigned_at,revoked_at")
      .is("revoked_at", null)
      .limit(1000),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", authData.user.id)
      .is("revoked_at", null),
  ]);

  const events = (eventData ?? []) as EventRow[];
  const staff = (roleData ?? []) as EventRoleRow[];
  const roles = new Set((clubRoles ?? []).map((assignment) => assignment.role));
  const isManager =
    roles.has("executive") || roles.has("admin") || roles.has("backup_admin");
  const eventIds = events.map((event) => event.id);
  const [
    { data: memberData, error: membersError },
    { data: budgetData, error: budgetError },
    { data: allocationData, error: allocationError },
  ] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("id,full_name,username")
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(1000),
    eventIds.length
      ? supabase
          .from("event_budgets")
          .select("event_id,total_ngn")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabase
          .from("event_budget_allocations")
          .select("event_id,position,allocation_name,amount_ngn")
          .in("event_id", eventIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const members = new Map(
    ((memberData ?? []) as MemberRow[]).map((member) => [member.id, member]),
  );
  const budgets = new Map(
    ((budgetData ?? []) as BudgetRow[]).map((budget) => [
      budget.event_id,
      budget,
    ]),
  );
  const allocationsByEvent = new Map<string, AllocationRow[]>();
  for (const allocation of (allocationData ?? []) as AllocationRow[]) {
    const current = allocationsByEvent.get(allocation.event_id) ?? [];
    current.push(allocation);
    allocationsByEvent.set(allocation.event_id, current);
  }

  const now = Date.now();
  const activeEvents = events.filter((event) => !event.archived_at);
  const scheduledUpcoming = activeEvents
    .filter(
      (event) =>
        event.status === "scheduled" &&
        new Date(event.starts_at).getTime() >= now,
    )
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const pastEvents = activeEvents
    .filter(
      (event) =>
        event.status !== "scheduled" ||
        new Date(event.starts_at).getTime() < now,
    )
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  const recentPast = pastEvents.slice(0, 4);
  const olderPast = pastEvents.slice(4);
  const archivedEvents = events
    .filter((event) => event.archived_at)
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  const archive = [...archivedEvents, ...olderPast];
  const eventReadError = eventsError || rolesError || clubRolesError;
  const budgetReadError = budgetError || allocationError;
  const currentRoleRows = staff;
  const noticeTextValue =
    notice ??
    (eventReadError
      ? "Event information could not be loaded. No event actions are available."
      : budgetReadError
        ? "Budget information could not be loaded."
        : membersError
          ? "The active member list could not be loaded. Role assignment is unavailable."
          : undefined);
  const canCreate = !eventReadError && isManager;

  return (
    <main className="shell">
      <section className="panel event-panel">
        <header className="events-header member-page-header">
          <div>
            <p className="eyebrow">Members · events</p>
            <h1>Events and planning</h1>
            <p>
              Club event details, staffing and budgets. All event times are
              shown in Lagos time (WAT).
            </p>
          </div>
        </header>

        {noticeTextValue ? (
          <p className="notice" role="status">
            {noticeTextValue}
          </p>
        ) : null}

        {canCreate ? (
          <details className="event-create">
            <summary>Create an event</summary>
            <p className="muted">
              Executive, Admin and Backup Admin accounts can create events.
              Feature choices are fixed after creation.
            </p>
            <form action={createEventAction} className="form-stack event-form">
              <label>
                Event title
                <input maxLength={120} name="title" required />
              </label>
              <label>
                Event type
                <select name="event_type" required defaultValue="meeting">
                  <option value="meeting">Meeting</option>
                  <option value="party">Party</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Date and time (WAT)
                <input name="starts_at" required type="datetime-local" />
              </label>
              <label>
                Location
                <input maxLength={200} name="location" required />
              </label>
              <label>
                Details
                <textarea maxLength={2000} name="description" rows={3} />
              </label>
              <fieldset className="feature-fieldset">
                <legend>Fixed event features</legend>
                <label className="check-option">
                  <input
                    name="minutes_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Meeting minutes
                </label>
                <label className="check-option">
                  <input
                    name="attendance_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Attendance
                </label>
                <label className="check-option">
                  <input
                    name="budget_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Budget and allocations
                </label>
                <label className="check-option">
                  <input
                    name="income_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Revenue
                </label>
                <label className="check-option">
                  <input
                    name="expenses_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Expenses
                </label>
                <label className="check-option">
                  <input
                    name="ticketing_enabled"
                    type="checkbox"
                    value="enabled"
                  />
                  Party ticket tiers
                </label>
                <p className="muted">
                  Ticket tiers are only available for a party with revenue
                  enabled. Ticket-sale controls are part of the next roadmap
                  step.
                </p>
              </fieldset>
              <button type="submit">Create event</button>
            </form>
          </details>
        ) : null}

        {eventReadError ? null : (
          <>
            <section
              className="events-section"
              aria-labelledby="upcoming-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Plan and prepare</p>
                  <h2 id="upcoming-heading">Upcoming events</h2>
                </div>
                <span className="event-count">
                  {scheduledUpcoming.length} scheduled
                </span>
              </div>
              {scheduledUpcoming.length ? (
                <div className="event-list">
                  {scheduledUpcoming.map((event) => (
                    <EventCard
                      allocations={allocationsByEvent.get(event.id) ?? []}
                      budget={budgets.get(event.id)}
                      budgetReadError={Boolean(budgetReadError)}
                      event={event}
                      eventRoles={
                        new Set(
                          currentRoleRows
                            .filter(
                              (assignment) =>
                                assignment.event_id === event.id &&
                                assignment.member_id === authData.user.id,
                            )
                            .map((assignment) => assignment.role),
                        )
                      }
                      key={event.id}
                      members={members}
                      roles={roles}
                      staff={currentRoleRows}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-state">No upcoming events are scheduled.</p>
              )}
            </section>

            <section className="events-section" aria-labelledby="past-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Recent history</p>
                  <h2 id="past-heading">Latest past events</h2>
                </div>
                <span className="event-count">{recentPast.length} recent</span>
              </div>
              {recentPast.length ? (
                <div className="event-list">
                  {recentPast.map((event) => (
                    <EventCard
                      allocations={allocationsByEvent.get(event.id) ?? []}
                      budget={budgets.get(event.id)}
                      budgetReadError={Boolean(budgetReadError)}
                      event={event}
                      eventRoles={
                        new Set(
                          currentRoleRows
                            .filter(
                              (assignment) =>
                                assignment.event_id === event.id &&
                                assignment.member_id === authData.user.id,
                            )
                            .map((assignment) => assignment.role),
                        )
                      }
                      key={event.id}
                      members={members}
                      roles={roles}
                      staff={currentRoleRows}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-state">There are no past events yet.</p>
              )}
            </section>

            <section
              className="events-section"
              aria-labelledby="archive-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Retained history</p>
                  <h2 id="archive-heading">Event archive</h2>
                </div>
                <span className="event-count">{archive.length} retained</span>
              </div>
              {archive.length ? (
                <div className="event-list">
                  {archive.map((event) => (
                    <EventCard
                      allocations={allocationsByEvent.get(event.id) ?? []}
                      archivedGroup
                      budget={budgets.get(event.id)}
                      budgetReadError={Boolean(budgetReadError)}
                      event={event}
                      eventRoles={new Set()}
                      key={event.id}
                      members={members}
                      roles={roles}
                      staff={currentRoleRows}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-state">
                  Older event records will remain available here for reporting.
                </p>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
