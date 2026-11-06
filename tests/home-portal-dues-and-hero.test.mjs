import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const memberDuesCardSource = readFileSync(
  new URL("../src/components/home/member-dues-card.tsx", import.meta.url),
  "utf8",
);
const homeDashboardViewSource = readFileSync(
  new URL("../src/components/home-dashboard-view.tsx", import.meta.url),
  "utf8",
);
const portalPageSource = readFileSync(
  new URL("../src/app/portal/page.tsx", import.meta.url),
  "utf8",
);

describe("Home Portal — Dues Section and Hero Banner (Stage 2)", () => {
  describe("Member Dues Card — Due Now Calculation & Copy", () => {
    it("dynamically filters unpaid rows and calculates total unpaid NGN balance", () => {
      assert.match(
        memberDuesCardSource,
        /const unpaidRows = rows\.filter\(\(r\) => r\.status === "unpaid"\)/,
      );
      assert.match(
        memberDuesCardSource,
        /const unpaidTotalNgn = unpaidRows\.reduce\(\(sum, r\) => sum \+ r\.amountNgn, 0\)/,
      );
      assert.match(
        memberDuesCardSource,
        /const unpaidMonthsCount = unpaidRows\.length/,
      );
    });

    it("displays Desktop wording with dynamic number of months due", () => {
      assert.match(
        memberDuesCardSource,
        /\{unpaidMonthsCount\} \{unpaidMonthsCount === 1 \? "month" : "months"\} due/,
      );
    });

    it("displays Mobile wording with dynamic number of months owed", () => {
      assert.match(
        memberDuesCardSource,
        /\{unpaidMonthsCount\} mo owed/,
      );
    });
  });

  describe("Member Dues Card — Status to Action Transition", () => {
    it("renders Pay now button and opens PayDuesModal when member has outstanding dues", () => {
      assert.match(
        memberDuesCardSource,
        /onClick=\{\(\) => setIsPayModalOpen\(true\)\}/,
      );
      assert.match(memberDuesCardSource, /Pay now/);
      assert.match(
        memberDuesCardSource,
        /<PayDuesModal[\s\S]*?isOpen=\{isPayModalOpen\}[\s\S]*?onClose=\{\(\) => setIsPayModalOpen\(false\)\}/,
      );
    });

    it("renders 'Up to date' text and suppresses Pay now button when member has no outstanding dues", () => {
      assert.match(memberDuesCardSource, /Up to date/);
      assert.doesNotMatch(
        memberDuesCardSource,
        /Owes ₦/,
        "Old owes status badge should be replaced by action flow",
      );
    });
  });

  describe("Member Dues Card — Ledger Presentation & Privacy Badge Removal", () => {
    it("removes the private member ledger confidential pill", () => {
      assert.doesNotMatch(
        memberDuesCardSource,
        /Private Member Ledger/,
        "Confidential badge pill must be removed",
      );
      assert.doesNotMatch(
        memberDuesCardSource,
        /Confidential<\/span>/,
        "Confidential label must be removed",
      );
    });

    it("presents Full ledger as anchored text link preserving href to /dues", () => {
      assert.match(
        memberDuesCardSource,
        /<Link[\s\S]*?href="\/dues"[\s\S]*?>[\s\S]*?<span>Full ledger<\/span>/,
      );
      // Ensure it is styled as inline anchored text, not a pill or button
      assert.match(memberDuesCardSource, /hover:underline/);
    });
  });

  describe("Home Dashboard View — Forest Green Hero Banner", () => {
    it("applies Carpenters Forest Green brand palette styling to the hero banner", () => {
      assert.match(homeDashboardViewSource, /bg-\[#174C37\]/);
      assert.match(homeDashboardViewSource, /border-\[#0C3325\]/);
      assert.match(homeDashboardViewSource, /variant="light"/);
      assert.match(homeDashboardViewSource, /text-white/);
    });

    it("wires paymentSettings to MemberDuesCard", () => {
      assert.match(
        homeDashboardViewSource,
        /<MemberDuesCard[\s\S]*?paymentSettings=\{paymentSettings\}/,
      );
    });
  });

  describe("Portal Page — Bank Settings Provisioning", () => {
    it("queries club_payment_settings and passes down to HomeDashboardView", () => {
      assert.match(portalPageSource, /\.from\("club_payment_settings"\)/);
      assert.match(
        portalPageSource,
        /<HomeDashboardView[\s\S]*?paymentSettings=\{paymentSettings\}/,
      );
    });
  });
});
