import Link from "next/link";
import {
  announcementPreview,
  type HomeDashboardData,
} from "@/lib/home-dashboard.server";

type HomeDashboardViewProps = {
  dashboard: HomeDashboardData;
  memberName: string;
  notice?: string;
};

function formatDashboardMonth(month: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${month}T12:00:00.000Z`));
}

function formatDashboardDate(date: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long",
    timeZone: "Africa/Lagos",
  }).format(new Date(`${date}T12:00:00+01:00`));
}

function formatDashboardDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

function formatDashboardAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function eventTypeLabel(eventType: string) {
  if (eventType === "meeting") return "Meeting";
  if (eventType === "party") return "Celebration";
  return "Club event";
}

function eventStampMonth(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

function eventStampDay(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

export default function HomeDashboardView({
  dashboard,
  memberName,
  notice,
}: HomeDashboardViewProps) {
  const currentDues = dashboard.dues.rows[0] ?? null;
  const duesStatusLabel = currentDues
    ? currentDues.status === "paid"
      ? "Paid"
      : currentDues.status === "written_off"
        ? "Written off"
        : currentDues.isOverdue
          ? "Overdue"
          : "Due by month end"
    : null;
  const duesStatusTone = currentDues
    ? currentDues.status === "paid"
      ? "is-paid"
      : currentDues.status === "written_off"
        ? "is-written-off"
        : currentDues.isOverdue
          ? "is-overdue"
          : "is-due"
    : "";

  return (
    <main className="shell home-shell">
      <div className="home-dashboard">
        <header className="home-dashboard-header member-page-header">
          <div>
            <p className="eyebrow">Carpenters Family Social Club</p>
            <h1>Welcome, {memberName}</h1>
            <p className="home-dashboard-intro">
              Your next gatherings, current dues status, and club news.
            </p>
          </div>
          <span className="home-member-mark">Member home</span>
        </header>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="home-dashboard-grid">
          <section
            aria-labelledby="home-events-heading"
            className="home-dashboard-section home-events-section"
          >
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">On the calendar</p>
                <h2 id="home-events-heading">Coming up</h2>
              </div>
              <Link href="/events">All events</Link>
            </div>

            {dashboard.events.unavailable ? (
              <p className="home-data-error" role="alert">
                Upcoming events could not be loaded. Try opening the events page
                again.
              </p>
            ) : dashboard.events.rows.length ? (
              <ol className="home-event-list">
                {dashboard.events.rows.map((event, index) => (
                  <li
                    className={
                      index === 0
                        ? "home-event-item home-event-primary"
                        : "home-event-item"
                    }
                    key={event.id}
                  >
                    <div aria-hidden="true" className="home-event-date">
                      <span>{eventStampMonth(event.startsAt)}</span>
                      <strong>{eventStampDay(event.startsAt)}</strong>
                    </div>
                    <div className="home-event-copy">
                      <p className="home-event-kind">
                        {index === 0
                          ? "Next gathering"
                          : eventTypeLabel(event.eventType)}
                      </p>
                      <h3>{event.title}</h3>
                      <p>
                        <time dateTime={event.startsAt}>
                          {formatDashboardDateTime(event.startsAt)}
                        </time>
                      </p>
                      <p className="home-event-location">{event.location}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="home-empty-state">
                No upcoming events have been scheduled.
              </p>
            )}
          </section>

          <section
            aria-labelledby="home-dues-heading"
            className="home-dashboard-section home-dues-section"
          >
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">Private to you</p>
                <h2 id="home-dues-heading">Your dues</h2>
              </div>
              <Link href="/dues">My dues</Link>
            </div>

            {dashboard.dues.unavailable ? (
              <p className="home-data-error" role="alert">
                Your current dues status could not be loaded. Open My dues to
                check it.
              </p>
            ) : currentDues ? (
              <>
                <p className="home-dues-period">
                  {dashboard.currentMonth
                    ? formatDashboardMonth(dashboard.currentMonth)
                    : "Current month"}
                </p>
                <p className="home-dues-amount">
                  {formatDashboardAmount(currentDues.amountNgn)}
                </p>
                <p className={`home-dues-status ${duesStatusTone}`}>
                  <span aria-hidden="true" />
                  {duesStatusLabel}
                </p>
                {currentDues.status === "unpaid" ? (
                  <p className="home-dues-deadline">
                    Payment due by {formatDashboardDate(currentDues.dueDate)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="home-empty-state">
                No current-month dues status is available.
              </p>
            )}
          </section>

          <section
            aria-labelledby="home-announcements-heading"
            className="home-dashboard-section home-announcements-section"
          >
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">From the club</p>
                <h2 id="home-announcements-heading">Latest news</h2>
              </div>
              <Link href="/announcements">All announcements</Link>
            </div>

            {dashboard.announcements.unavailable ? (
              <p className="home-data-error" role="alert">
                Club news could not be loaded. Try opening announcements again.
              </p>
            ) : dashboard.announcements.rows.length ? (
              <div className="home-announcement-list">
                {dashboard.announcements.rows.map((announcement) => (
                  <article key={announcement.id}>
                    <div className="home-announcement-meta">
                      <h3>{announcement.title}</h3>
                      <time dateTime={announcement.createdAt}>
                        {formatDashboardDateTime(announcement.createdAt)}
                      </time>
                    </div>
                    <p>{announcementPreview(announcement.message)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="home-empty-state">
                There are no announcements yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
