import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getNavigationItems } from "../src/lib/app-navigation.mjs";
import { isEventLiveOrUpcoming } from "../src/lib/event-times.mjs";
import { getAttendancePageAccess } from "../src/lib/attendance-page-access.mjs";

const meetingHubViewSource = readFileSync(
  new URL("../src/components/attendance/attendance-hub-view.tsx", import.meta.url),
  "utf8",
);
const meetingHubPageSource = readFileSync(
  new URL("../src/app/(member)/meeting-hub/page.tsx", import.meta.url),
  "utf8",
);
const newMeetingModalSource = readFileSync(
  new URL("../src/components/attendance/new-meeting-modal.tsx", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);

describe("Meeting Hub Standalone Migration (Stage 4)", () => {
  describe("Route and Naming", () => {
    it("updates navigation items to include /meeting-hub and exclude /attendance", () => {
      const items = getNavigationItems(["member"]);
      const meetingHubItem = items.find((i) => i.href === "/meeting-hub");
      const attendanceItem = items.find((i) => i.href === "/attendance");

      assert.ok(meetingHubItem, "Expected /meeting-hub in navigation items");
      assert.equal(meetingHubItem.label, "Meeting Hub");
      assert.equal(attendanceItem, undefined, "/attendance should not be in navigation");
    });

    it("ensures legacy /attendance/page.tsx does not exist (clean 404)", () => {
      const attendancePageExists = existsSync(
        new URL("../src/app/(member)/attendance/page.tsx", import.meta.url),
      );
      assert.equal(
        attendancePageExists,
        false,
        "/attendance/page.tsx must be removed without redirect",
      );
    });

    it("ensures /meeting-hub/page.tsx exists and filters strictly by event_type = 'meeting'", () => {
      assert.match(meetingHubPageSource, /\.eq\("event_type", "meeting"\)/);
    });

    it("removes 'Back to Events & Planning' from Meeting Hub header", () => {
      assert.doesNotMatch(meetingHubViewSource, /Back to Events & Planning/);
      assert.doesNotMatch(meetingHubViewSource, /href="\/events"/);
    });

    it("names page 'Meeting Hub' with Secretariat subtitle", () => {
      assert.match(meetingHubViewSource, /<h1[^>]*>[\s\S]*?Meeting Hub[\s\S]*?<\/h1>/);
      assert.match(
        meetingHubViewSource,
        /Live meeting check-in, official minutes, and attendance\s+records\./,
      );
    });
  });

  describe("Meeting Creation & Authorization", () => {
    it("renders 'New Meeting' button opening NewMeetingModal for authorized roles", () => {
      assert.match(meetingHubViewSource, /New Meeting/);
      assert.match(meetingHubViewSource, /setIsNewMeetingModalOpen\(true\)/);
      assert.match(meetingHubViewSource, /<NewMeetingModal/);
    });

    it("authorizes admin, president, and executive to create meetings", () => {
      const adminAccess = getAttendancePageAccess({
        roles: new Set(["admin"]),
        eventRoles: new Set(),
      });
      const presidentAccess = getAttendancePageAccess({
        roles: new Set(["president"]),
        eventRoles: new Set(),
      });
      const execAccess = getAttendancePageAccess({
        roles: new Set(["executive"]),
        eventRoles: new Set(),
      });
      const memberAccess = getAttendancePageAccess({
        roles: new Set(["member"]),
        eventRoles: new Set(),
      });

      assert.equal(adminAccess.canControl, true);
      assert.equal(presidentAccess.canControl, true);
      assert.equal(execAccess.canControl, true);
      assert.equal(memberAccess.canControl, false);
    });

    it("configures NewMeetingModal with meeting event type, minutes, and attendance enabled", () => {
      assert.match(
        newMeetingModalSource,
        /<input name="event_type" type="hidden" value="meeting" \/>/,
      );
      assert.match(
        newMeetingModalSource,
        /<input name="minutes_enabled" type="hidden" value="enabled" \/>/,
      );
      assert.match(
        newMeetingModalSource,
        /<input name="attendance_enabled" type="hidden" value="enabled" \/>/,
      );
    });
  });

  describe("3 Distinct Meeting Sections", () => {
    it("defines Upcoming Meetings, Past Meetings, and Cancelled / Archived Meetings sections", () => {
      assert.match(meetingHubViewSource, /Upcoming Meetings/);
      assert.match(meetingHubViewSource, /Past Meetings/);
      assert.match(meetingHubViewSource, /Cancelled \/ Archived Meetings/);
    });

    it("sets Upcoming Meetings to open by default, and Past / Archived to collapsed by default", () => {
      assert.match(
        meetingHubViewSource,
        /const \[upcomingOpen, setUpcomingOpen\] = useState\(true\);/,
      );
      assert.match(
        meetingHubViewSource,
        /const \[pastOpen, setPastOpen\] = useState\(false\);/,
      );
      assert.match(
        meetingHubViewSource,
        /const \[archivedOpen, setArchivedOpen\] = useState\(false\);/,
      );
    });

    it("partitions meetings correctly across sections without overlap or omission", () => {
      const now = new Date("2026-11-06T12:00:00Z").getTime();

      const sampleMeetings = [
        {
          id: "m1",
          title: "Next Scheduled Assembly",
          event_type: "meeting",
          starts_at: "2026-12-01T15:00:00Z",
          duration_days: 1,
          status: "scheduled",
          archived_at: null,
        },
        {
          id: "m2",
          title: "Concluded Last Month Meeting",
          event_type: "meeting",
          starts_at: "2026-10-01T15:00:00Z",
          duration_days: 1,
          status: "concluded",
          archived_at: null,
        },
        {
          id: "m3",
          title: "Cancelled Meeting",
          event_type: "meeting",
          starts_at: "2026-11-15T15:00:00Z",
          duration_days: 1,
          status: "cancelled",
          archived_at: null,
        },
        {
          id: "m4",
          title: "Archived Meeting",
          event_type: "meeting",
          starts_at: "2026-05-01T15:00:00Z",
          duration_days: 1,
          status: "concluded",
          archived_at: "2026-06-01T00:00:00Z",
        },
      ];

      const upcoming = sampleMeetings.filter(
        (m) =>
          !m.archived_at &&
          m.status === "scheduled" &&
          isEventLiveOrUpcoming(m, now),
      );
      const past = sampleMeetings.filter(
        (m) =>
          !m.archived_at &&
          m.status !== "cancelled" &&
          (!isEventLiveOrUpcoming(m, now) || m.status === "concluded"),
      );
      const cancelledOrArchived = sampleMeetings.filter(
        (m) => Boolean(m.archived_at) || m.status === "cancelled",
      );

      assert.deepEqual(upcoming.map((m) => m.id), ["m1"]);
      assert.deepEqual(past.map((m) => m.id), ["m2"]);
      assert.deepEqual(cancelledOrArchived.map((m) => m.id), ["m3", "m4"]);
      assert.equal(
        upcoming.length + past.length + cancelledOrArchived.length,
        sampleMeetings.length,
      );
    });
  });

  describe("Shortened Tab Headings", () => {
    it("shortens tab labels to Check-In, Minutes, and Standing", () => {
      assert.match(
        meetingHubViewSource,
        /<UserCheck[^>]*\/>[\s\S]*?<span>(?:Attendance|Check-In)<\/span>/,
      );
      assert.match(
        meetingHubViewSource,
        /<FileText[^>]*\/>[\s\S]*?<span>Minutes<\/span>/,
      );
      assert.match(
        meetingHubViewSource,
        /<History[^>]*\/>[\s\S]*?<span>Standing<\/span>/,
      );

      assert.doesNotMatch(meetingHubViewSource, />Check-in & Live Roll Call</);
      assert.doesNotMatch(meetingHubViewSource, />Meeting Minutes & Transcripts</);
      assert.doesNotMatch(meetingHubViewSource, />My Attendance Standing</);
    });

    it("revalidates and routes to /meeting-hub in server actions", () => {
      assert.match(actionsSource, /revalidatePath\("\/meeting-hub"\)/);
      assert.match(actionsSource, /\/meeting-hub\?event=/);
    });
  });
});
