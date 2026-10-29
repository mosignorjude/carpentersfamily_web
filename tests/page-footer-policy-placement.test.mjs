import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const announcementsView = readFileSync(
  new URL(
    "../src/components/communications/announcements-page-view.tsx",
    import.meta.url
  ),
  "utf8"
);
const pollsView = readFileSync(
  new URL(
    "../src/components/communications/polls-page-view.tsx",
    import.meta.url
  ),
  "utf8"
);
const memberAdminView = readFileSync(
  new URL(
    "../src/components/admin/members/member-admin-page-view.tsx",
    import.meta.url
  ),
  "utf8"
);
const financesView = readFileSync(
  new URL(
    "../src/components/finances/finances-page-view.tsx",
    import.meta.url
  ),
  "utf8"
);
const duesView = readFileSync(
  new URL(
    "../src/components/dues/dues-page-view.tsx",
    import.meta.url
  ),
  "utf8"
);
const eventCard = readFileSync(
  new URL(
    "../src/components/events/event-card.tsx",
    import.meta.url
  ),
  "utf8"
);
const teamRolesTab = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-team-roles.tsx",
    import.meta.url
  ),
  "utf8"
);

describe("Page Footer Policy & Governance Relocation", () => {
  it("relocates CommunicationsPrivacyBanner to the footer of AnnouncementsPageView", () => {
    // Must NOT be placed right after the header badge
    assert.doesNotMatch(
      announcementsView,
      /Official Club Notices[\s\S]*?<CommunicationsPrivacyBanner view="announcements"\s*\/>[\s\S]*?FilteredAnnouncements/i,
      "Announcements privacy banner must not precede notice filters or announcement feed"
    );

    // Must be placed in a footer element at the bottom
    assert.match(
      announcementsView,
      /<footer[\s\S]*?<CommunicationsPrivacyBanner view="announcements"\s*\/>[\s\S]*?<\/footer>/,
      "Announcements privacy banner must reside inside the page footer"
    );
  });

  it("relocates CommunicationsPrivacyBanner to the footer of PollsPageView", () => {
    // Must NOT be placed right after the header badge
    assert.doesNotMatch(
      pollsView,
      /Electoral Governance Protocol[\s\S]*?<CommunicationsPrivacyBanner view="polls"\s*\/>[\s\S]*?PollLiveRefresh/,
      "Polls privacy banner must not precede live refresh or active ballot feed"
    );

    // Must be placed in a footer element at the bottom
    assert.match(
      pollsView,
      /<footer[\s\S]*?<CommunicationsPrivacyBanner view="polls"\s*\/>[\s\S]*?<\/footer>/,
      "Polls privacy banner must reside inside the page footer"
    );
  });

  it("relocates MemberAdminPermissionGuide to the footer of MemberAdminPageView", () => {
    // Must NOT be placed in the page header
    assert.doesNotMatch(
      memberAdminView,
      /<h1[^>]*>[\s\S]*?Member administration[\s\S]*?<MemberAdminPermissionGuide\s*\/>[\s\S]*?id="pending-requests"/,
      "Member admin permission guide must not sit inside top page header above pending applications"
    );

    // Must be placed after Section 4: Audit History
    assert.match(
      memberAdminView,
      /id="member-audit"[\s\S]*?<MemberAdminAuditSection[\s\S]*?<footer[\s\S]*?<MemberAdminPermissionGuide\s*\/>[\s\S]*?<\/footer>/,
      "Member admin permission guide must be relocated to the footer below audit history"
    );
  });

  it("relocates Privacy & Shared Ledger Mandate to the footer of FinancesPageView", () => {
    // Must NOT be placed inside the hero section
    assert.doesNotMatch(
      financesView,
      /<section[^>]*finances-hero-heading[\s\S]*?Privacy & Shared Ledger Mandate[\s\S]*?<\/section>/,
      "Finances hero section must not contain the bulky privacy mandate banner"
    );

    // Must be placed inside the footer
    assert.match(
      financesView,
      /<footer[\s\S]*?Privacy &amp; Shared Ledger Mandate[\s\S]*?<\/footer>/,
      "Finances privacy & shared ledger mandate must reside in the page footer"
    );
  });

  it("relocates Club Administrator Exemption notice to the footer of DuesPageView", () => {
    // Must NOT be placed directly after the hero section above member switcher
    assert.doesNotMatch(
      duesView,
      /<\/section>\s*\{isAdmin\s*&&[\s\S]*?Club Administrator Exemption[\s\S]*?Review Individual Member Ledger/,
      "Dues page must not interpose admin exemption banner between hero and member switcher"
    );

    // Must be placed inside the footer
    assert.match(
      duesView,
      /<footer[\s\S]*?Club Administrator Exemption Policy[\s\S]*?<\/footer>/,
      "Club Administrator Exemption must reside in the dues page footer"
    );
  });

  it("removes redundant inline governance note from EventCard body and retains in drawer", () => {
    // Must NOT have the inline governance note box above features
    assert.doesNotMatch(
      eventCard,
      /event\.location[\s\S]*?Governance Note:[\s\S]*?Features:/,
      "EventCard must not display bulky inline governance note in card body"
    );

    // Must retain governance schedule in drawer
    assert.match(
      eventCard,
      /Governance & Audit Schedule[\s\S]*?Archived:/,
      "EventCard drawer must retain governance & audit schedule details"
    );
  });

  it("renders Financial Governance Rules as a collapsible footer disclosure in TabTeamRoles", () => {
    assert.match(
      teamRolesTab,
      /<details[\s\S]*?Financial Governance Rules[\s\S]*?All transactions above ₦500,000[\s\S]*?<\/details>/,
      "TabTeamRoles must render financial governance rules inside a collapsible disclosure"
    );
  });
});
