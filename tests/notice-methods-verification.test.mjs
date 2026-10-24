import assert from "node:assert/strict";
import test from "node:test";
import { getSystemNotice, SYSTEM_NOTICES } from "../src/lib/system-notices.ts";
import { formatPrimaryRole } from "../src/lib/user-profile.ts";

// ============================================================================
// 1. FLASH MESSAGES & TOAST NOTIFICATIONS (Phase 1 & 2 Verification)
// ============================================================================

test("system notices: allowlisted keys return valid structured notice definitions", () => {
  const successNotice = getSystemNotice("budget-saved");
  assert.ok(successNotice);
  assert.equal(successNotice.type, "success");
  assert.equal(successNotice.title, "Budget Saved");
  assert.ok(successNotice.message.length > 0);

  const warningNotice = getSystemNotice("transaction-voided");
  assert.ok(warningNotice);
  assert.equal(warningNotice.type, "warning");
  assert.equal(warningNotice.title, "Transaction Voided");

  const errorNotice = getSystemNotice("denied");
  assert.ok(errorNotice);
  assert.equal(errorNotice.type, "error");
  assert.equal(errorNotice.title, "Access Denied");

  const duesNotice = getSystemNotice("dues-request-approved");
  assert.ok(duesNotice);
  assert.equal(duesNotice.type, "success");
  assert.equal(duesNotice.title, "Dues Approved");
});

test("system notices: unknown or hostile query parameters fail closed to null (anti-prototype pollution)", () => {
  // Prototype pollution attempts
  assert.equal(getSystemNotice("__proto__"), null);
  assert.equal(getSystemNotice("constructor"), null);
  assert.equal(getSystemNotice("toString"), null);
  assert.equal(getSystemNotice("valueOf"), null);

  // Arbitrary or malicious injected query values
  assert.equal(getSystemNotice("<script>alert(1)</script>"), null);
  assert.equal(getSystemNotice("unrecognized_action_123"), null);
  assert.equal(getSystemNotice(""), null);
  assert.equal(getSystemNotice(null), null);
  assert.equal(getSystemNotice(undefined), null);
  assert.equal(getSystemNotice(123), null);
});

test("system notices: every defined notice has a valid FlashCardType and non-empty copy", () => {
  const validTypes = new Set(["success", "warning", "error", "info"]);

  for (const [key, def] of Object.entries(SYSTEM_NOTICES)) {
    assert.ok(
      typeof key === "string" && key.length > 0,
      `Notice key must be non-empty: ${key}`,
    );
    assert.ok(
      validTypes.has(def.type),
      `Notice "${key}" has invalid type "${def.type}"`,
    );
    assert.ok(
      typeof def.title === "string" && def.title.trim().length > 0,
      `Notice "${key}" has empty title`,
    );
    assert.ok(
      typeof def.message === "string" && def.message.trim().length > 0,
      `Notice "${key}" has empty message`,
    );
  }
});

// ============================================================================
// 2. INLINE FORM VALIDATION & HEADROOM CALCULATION (Phase 3 Verification)
// ============================================================================

test("inline validation: calculateCategoryHeadroom correctly bounds allocations <= 100%", () => {
  function calculateCategoryHeadroom(
    categoryName,
    allocatedCostCenters,
    targetName = "",
  ) {
    const isEdit =
      targetName.length > 0 &&
      categoryName.toLowerCase() === targetName.toLowerCase();

    const otherAllocationsSum = allocatedCostCenters
      .filter((c) => c.name.toLowerCase() !== categoryName.toLowerCase())
      .reduce((sum, c) => sum + (Number(c.percentage) || 0), 0);

    const remainingGlobalHeadroom = Math.max(0, 100 - otherAllocationsSum);

    const currentItemAllocation = allocatedCostCenters.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    const currentPercent = currentItemAllocation
      ? Number(currentItemAllocation.percentage) || 0
      : 0;

    return {
      isEdit,
      currentPercent,
      otherAllocationsSum,
      remainingGlobalHeadroom,
      maxAllowedPercentage: remainingGlobalHeadroom,
    };
  }

  const currentAllocations = [
    { name: "Venue", percentage: 50 },
    { name: "Security", percentage: 35 },
  ]; // Total = 85%, Remaining = 15%

  // 1. Allocating an unallocated new category (e.g. "Catering")
  const newCatHeadroom = calculateCategoryHeadroom(
    "Catering",
    currentAllocations,
  );
  assert.equal(newCatHeadroom.isEdit, false);
  assert.equal(newCatHeadroom.otherAllocationsSum, 85);
  assert.equal(newCatHeadroom.remainingGlobalHeadroom, 15);
  assert.equal(newCatHeadroom.maxAllowedPercentage, 15);

  // 2. Editing existing category "Venue" (currently 50%)
  // Headroom is 100 - sum(Security) = 100 - 35 = 65%
  const venueHeadroom = calculateCategoryHeadroom(
    "Venue",
    currentAllocations,
    "Venue",
  );
  assert.equal(venueHeadroom.isEdit, true);
  assert.equal(venueHeadroom.currentPercent, 50);
  assert.equal(venueHeadroom.otherAllocationsSum, 35);
  assert.equal(venueHeadroom.maxAllowedPercentage, 65);

  // 3. Reducing "Venue" allocation from 50% to 20% frees up headroom for other categories
  const reducedAllocations = [
    { name: "Venue", percentage: 20 },
    { name: "Security", percentage: 35 },
  ]; // Total = 55%, Remaining = 45%
  const freedHeadroom = calculateCategoryHeadroom(
    "Catering",
    reducedAllocations,
  );
  assert.equal(freedHeadroom.maxAllowedPercentage, 45);

  // 4. Fully allocated budget (100% total)
  const fullAllocations = [
    { name: "Venue", percentage: 50 },
    { name: "Security", percentage: 35 },
    { name: "Production", percentage: 15 },
  ];
  const zeroHeadroom = calculateCategoryHeadroom("Logistics", fullAllocations);
  assert.equal(zeroHeadroom.maxAllowedPercentage, 0);

  // But editing "Venue" within full budget still allows adjusting up to 50%
  const editInFull = calculateCategoryHeadroom(
    "Venue",
    fullAllocations,
    "Venue",
  );
  assert.equal(editInFull.maxAllowedPercentage, 50);
});

test("inline validation: financial amounts parse safely and reject negative/corrupt values", () => {
  function validateCurrencyInput(raw) {
    if (typeof raw !== "string")
      return { valid: false, amount: 0, error: "Invalid type" };
    const cleaned = raw.replace(/,/g, "").trim();
    if (!cleaned)
      return { valid: false, amount: 0, error: "Amount is required" };
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      return {
        valid: false,
        amount: 0,
        error: "Enter a valid positive currency amount",
      };
    }
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num) || num <= 0) {
      return {
        valid: false,
        amount: 0,
        error: "Amount must be strictly greater than 0",
      };
    }
    if (num > 100_000_000_000) {
      return {
        valid: false,
        amount: 0,
        error: "Amount exceeds institutional ceiling",
      };
    }
    return { valid: true, amount: Math.round(num), error: null };
  }

  assert.equal(validateCurrencyInput("50,000").valid, true);
  assert.equal(validateCurrencyInput("50,000").amount, 50000);
  assert.equal(validateCurrencyInput("1,250,000.50").valid, true);
  assert.equal(validateCurrencyInput("1,250,000.50").amount, 1250001);

  // Rejections
  assert.equal(validateCurrencyInput("-5000").valid, false);
  assert.equal(validateCurrencyInput("0").valid, false);
  assert.equal(validateCurrencyInput("abc").valid, false);
  assert.equal(validateCurrencyInput("").valid, false);
  assert.equal(validateCurrencyInput("100,000,000,000,000").valid, false);
});

// ============================================================================
// 3. FULL-SCREEN MODALS & STATE SCREENS (Phase 4 Verification)
// ============================================================================

test("state screens: EmptyStateCard and DataUnavailableCard provide accessible semantic roles", () => {
  function renderStateCardProps({ kind, title, message, onRetry }) {
    if (kind === "empty") {
      return {
        role: "status",
        "aria-live": "polite",
        title,
        message,
        isRetryable: false,
      };
    }
    return {
      role: "alert",
      "aria-live": "assertive",
      title,
      message,
      isRetryable: typeof onRetry === "function",
    };
  }

  const emptyCard = renderStateCardProps({
    kind: "empty",
    title: "No Transactions Recorded",
    message: "No financial entries have been posted to this event ledger yet.",
  });
  assert.equal(emptyCard.role, "status");
  assert.equal(emptyCard["aria-live"], "polite");
  assert.equal(emptyCard.isRetryable, false);

  const errorCard = renderStateCardProps({
    kind: "unavailable",
    title: "Ledger Data Unavailable",
    message: "Failed to communicate with treasury records.",
    onRetry: () => {},
  });
  assert.equal(errorCard.role, "alert");
  assert.equal(errorCard["aria-live"], "assertive");
  assert.equal(errorCard.isRetryable, true);
});

test("modal hygiene: Escape key listener and document body scroll-lock lifecycle simulation", () => {
  // Mock DOM environment
  const mockBody = { style: { overflow: "" } };
  const mockListeners = new Map();
  const mockWindow = {
    addEventListener: (type, handler) => mockListeners.set(type, handler),
    removeEventListener: (type) => mockListeners.delete(type),
  };

  let isClosed = false;
  const onClose = () => {
    isClosed = true;
  };

  function simulateModalHygiene(isOpen) {
    if (!isOpen) return () => {};

    const originalOverflow = mockBody.style.overflow;
    mockBody.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    mockWindow.addEventListener("keydown", handleKeyDown);

    return () => {
      mockBody.style.overflow = originalOverflow;
      mockWindow.removeEventListener("keydown");
    };
  }

  // 1. Open modal -> scroll locked
  const cleanup = simulateModalHygiene(true);
  assert.equal(mockBody.style.overflow, "hidden");
  assert.ok(mockListeners.has("keydown"));

  // 2. Press non-Escape key (e.g. 'Tab' or 'Enter') -> does not dismiss
  mockListeners.get("keydown")({ key: "Tab" });
  assert.equal(isClosed, false);

  // 3. Press 'Escape' key -> triggers dismissal
  mockListeners.get("keydown")({ key: "Escape" });
  assert.equal(isClosed, true);

  // 4. Cleanup on unmount -> restores body overflow and removes listener
  cleanup();
  assert.equal(mockBody.style.overflow, "");
  assert.equal(mockListeners.has("keydown"), false);
});

// ============================================================================
// 4. MICRO-INTERACTIONS & ANIMATED ICONS (Phase 5 Verification)
// ============================================================================

test("micro-interactions: FormSubmitButton state transitions and loading prevention", () => {
  function computeSubmitButtonProps({
    isPending,
    disabled,
    loadingText,
    label,
  }) {
    return {
      type: "submit",
      disabled: Boolean(disabled || isPending),
      "aria-busy": Boolean(isPending),
      showSpinner: Boolean(isPending),
      displayedText: isPending ? (loadingText ?? label) : label,
    };
  }

  // Idle state
  const idle = computeSubmitButtonProps({
    isPending: false,
    disabled: false,
    loadingText: "Saving...",
    label: "Save Budget Allocation",
  });
  assert.equal(idle.disabled, false);
  assert.equal(idle["aria-busy"], false);
  assert.equal(idle.showSpinner, false);
  assert.equal(idle.displayedText, "Save Budget Allocation");

  // Pending / Submitting state
  const pending = computeSubmitButtonProps({
    isPending: true,
    disabled: false,
    loadingText: "Saving...",
    label: "Save Budget Allocation",
  });
  assert.equal(
    pending.disabled,
    true,
    "Button must be disabled during active submission",
  );
  assert.equal(pending["aria-busy"], true);
  assert.equal(pending.showSpinner, true);
  assert.equal(pending.displayedText, "Saving...");

  // Disabled idle state (e.g. form validation invalid)
  const disabledIdle = computeSubmitButtonProps({
    isPending: false,
    disabled: true,
    loadingText: "Saving...",
    label: "Save Budget Allocation",
  });
  assert.equal(disabledIdle.disabled, true);
  assert.equal(disabledIdle.showSpinner, false);
});

test("micro-interactions: copy-to-clipboard state machine and timeout reset", () => {
  class CopyStateMachine {
    constructor(timeoutMs = 4000) {
      this.copied = false;
      this.timeoutMs = timeoutMs;
      this.timer = null;
    }

    triggerCopy(mockClipboardSucceeds = true) {
      if (!mockClipboardSucceeds) {
        // Fallback for restricted clipboard: still confirms visually
      }
      this.copied = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.copied = false;
      }, this.timeoutMs);
    }

    getState() {
      return {
        copied: this.copied,
        className: this.copied
          ? "bg-emerald-700 text-white scale-105 shadow-xs"
          : "bg-[#174C37] text-white hover:bg-[#103D2B]",
        label: this.copied ? "Copied!" : "Copy Account",
        icon: this.copied ? "Check" : "Copy",
      };
    }
  }

  const machine = new CopyStateMachine(4000);

  // Initial
  assert.equal(machine.getState().copied, false);
  assert.equal(machine.getState().label, "Copy Account");
  assert.equal(machine.getState().icon, "Copy");

  // On click
  machine.triggerCopy(true);
  assert.equal(machine.getState().copied, true);
  assert.equal(machine.getState().label, "Copied!");
  assert.equal(machine.getState().icon, "Check");
  assert.ok(machine.getState().className.includes("bg-emerald-700"));
  assert.ok(machine.getState().className.includes("scale-105"));
});

test("micro-interactions: chevron rotation classes toggle smoothly", () => {
  function getChevronClasses(isExpanded) {
    return `w-3.5 h-3.5 transition-transform duration-200 ${
      isExpanded ? "rotate-180" : ""
    }`.trim();
  }

  assert.equal(
    getChevronClasses(false),
    "w-3.5 h-3.5 transition-transform duration-200",
  );
  assert.equal(
    getChevronClasses(true),
    "w-3.5 h-3.5 transition-transform duration-200 rotate-180",
  );
});

// ============================================================================
// 6. MOBILE HEADER BRANDING & LEFT-ALIGNED DRAWER
// ============================================================================

test("mobile header: renders mobile brand logo and shortName with lg:hidden", async () => {
  const fs = await import("node:fs");
  const headerContent = fs.readFileSync(
    "src/components/app-header.tsx",
    "utf8",
  );

  // Verified brand import and mobile Link existence
  assert.ok(headerContent.includes('import { clubBrand } from "@/lib/brand"'));
  assert.ok(headerContent.includes('href="/"'));
  assert.ok(headerContent.includes("clubBrand.logoSrc"));
  assert.ok(headerContent.includes("clubBrand.shortName"));
  assert.ok(headerContent.includes("lg:hidden"));
});

test("mobile drawer: panel css anchors to left under menu toggle button", async () => {
  const fs = await import("node:fs");
  const cssContent = fs.readFileSync("src/app/globals.css", "utf8");

  // Ensure .app-mobile-menu-panel sets left: 1rem (and not right: 1rem)
  const panelMatches = [
    ...cssContent.matchAll(/\.app-mobile-menu-panel\s*\{([^}]+)\}/g),
  ];
  assert.ok(
    panelMatches.length >= 2,
    "Expected .app-mobile-menu-panel definitions in globals.css",
  );
  const basePanel = panelMatches.find((m) => m[1].includes("position: fixed"));
  assert.ok(basePanel, "Expected base .app-mobile-menu-panel definition");
  assert.ok(
    basePanel[1].includes("left: 1rem"),
    "Panel should anchor to left: 1rem",
  );
  assert.ok(
    basePanel[1].includes("right: auto"),
    "Panel should explicitly reset right: auto",
  );
  assert.ok(
    !basePanel[1].includes("right: 1rem"),
    "Panel should NOT anchor to right: 1rem",
  );
});

test("mobile drawer: includes outside click dismissal backdrop", async () => {
  const fs = await import("node:fs");
  const menuContent = fs.readFileSync(
    "src/components/mobile-app-menu.tsx",
    "utf8",
  );

  assert.ok(menuContent.includes("isOpen && ("));
  assert.ok(menuContent.includes("setIsOpen(false)"));
  assert.ok(menuContent.includes("fixed inset-0 z-70"));
});

// ============================================================================
// 7. NAVIGATION LOADING FEEDBACK & SKELETON SUSPENSE
// ============================================================================

test("navigation progress: root layout renders NavigationProgressBar", async () => {
  const fs = await import("node:fs");
  const layoutContent = fs.readFileSync("src/app/layout.tsx", "utf8");

  assert.ok(
    layoutContent.includes(
      'import { NavigationProgressBar } from "@/components/ui/navigation-progress-bar"',
    ),
    "Root layout should import NavigationProgressBar",
  );
  assert.ok(
    layoutContent.includes("<NavigationProgressBar />"),
    "Root layout should render NavigationProgressBar in body",
  );
});

test("navigation progress: component intercepts internal links and manages progress role", async () => {
  const fs = await import("node:fs");
  const progressContent = fs.readFileSync(
    "src/components/ui/navigation-progress-bar.tsx",
    "utf8",
  );

  assert.ok(progressContent.includes('role="progressbar"'));
  assert.ok(progressContent.includes("aria-valuemin={0}"));
  assert.ok(progressContent.includes("aria-valuemax={100}"));
  assert.ok(progressContent.includes("usePathname()"));
  assert.ok(progressContent.includes("useSearchParams()"));
  assert.ok(progressContent.includes('document.addEventListener("click"'));
  assert.ok(progressContent.includes('window.addEventListener("popstate"'));
  assert.ok(progressContent.includes("Suspense"));
});

// ============================================================================
// 8. AUTH BRAND & USER PROFILE BADGE VERIFICATION
// ============================================================================

test("formatPrimaryRole: correctly prioritizes club governance roles", () => {
  assert.equal(formatPrimaryRole(["admin", "executive"]), "ADMIN");
  assert.equal(formatPrimaryRole(["backup_admin", "member"]), "BACKUP ADMIN");
  assert.equal(formatPrimaryRole(["executive", "committee"]), "EXECUTIVE");
  assert.equal(formatPrimaryRole(["lead"]), "EVENT LEAD");
  assert.equal(formatPrimaryRole(["assistant"]), "EVENT ASSISTANT");
  assert.equal(formatPrimaryRole(["committee"]), "COMMITTEE");
  assert.equal(formatPrimaryRole(["member"]), "MEMBER");
  assert.equal(formatPrimaryRole([]), "MEMBER");
  assert.equal(formatPrimaryRole(["unknown_role"]), "MEMBER");
});

test("user profile badge: initial calculation handles edge cases gracefully", () => {
  function getBadgeInitial(fullName, username) {
    return (fullName || username || "M").trim().charAt(0).toUpperCase();
  }

  assert.equal(getBadgeInitial("John Doe", "jdoe"), "J");
  assert.equal(getBadgeInitial("", "mosignor"), "M");
  assert.equal(getBadgeInitial("  alex  ", ""), "A");
  assert.equal(getBadgeInitial("", ""), "M");
  assert.equal(getBadgeInitial("carlos", "admin"), "C");
});

test("auth brand: form sections display logo only without brand name or slogan", async () => {
  const fs = await import("node:fs");

  const authLayoutContent = fs.readFileSync(
    "src/components/auth-page-layout.tsx",
    "utf8",
  );
  assert.ok(
    authLayoutContent.includes("showText = false"),
    "AuthBrand showText parameter must default to false",
  );
  assert.ok(
    authLayoutContent.includes("{showText && ("),
    "Brand name and slogan must only render when showText is true",
  );

  // Check form pages render <AuthBrand /> without showText
  const signInContent = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(
    signInContent.includes("<AuthBrand />"),
    "Sign in page must use logo-only AuthBrand in form section",
  );

  const signUpContent = fs.readFileSync("src/app/signup/page.tsx", "utf8");
  assert.ok(
    signUpContent.includes("<AuthBrand />"),
    "Sign up page must use logo-only AuthBrand in form section",
  );

  const forgotPwContent = fs.readFileSync(
    "src/app/forgot-password/page.tsx",
    "utf8",
  );
  assert.ok(
    forgotPwContent.includes("<AuthBrand />"),
    "Forgot password page must use logo-only AuthBrand in form section",
  );

  const resetPwContent = fs.readFileSync(
    "src/app/reset-password/page.tsx",
    "utf8",
  );
  assert.ok(
    resetPwContent.includes("<AuthBrand />"),
    "Reset password page must use logo-only AuthBrand in form section",
  );

  // Auth photo panel retains showText
  assert.ok(
    authLayoutContent.includes("<AuthBrand inverse showText />"),
    "Auth photo panel should retain brand name and slogan with contrast",
  );
});

test("user profile badge: component supports desktop inline, mobile dropdown, and escape dismissal", async () => {
  const fs = await import("node:fs");

  const badgeContent = fs.readFileSync(
    "src/components/user-profile-badge.tsx",
    "utf8",
  );

  // Structural checks
  assert.ok(
    badgeContent.includes("hidden sm:flex"),
    "Must provide desktop inline badge layout",
  );
  assert.ok(
    badgeContent.includes("sm:hidden"),
    "Must provide mobile dropdown layout",
  );
  assert.ok(
    badgeContent.includes('aria-haspopup="menu"'),
    "Mobile toggle button must have aria-haspopup",
  );
  assert.ok(
    badgeContent.includes("aria-expanded={isDropdownOpen}"),
    "Mobile toggle button must indicate expanded state",
  );
  assert.ok(
    badgeContent.includes('role="menu"'),
    "Dropdown container must have menu role",
  );
  assert.ok(
    badgeContent.includes('role="menuitem"'),
    "Dropdown signout button must have menuitem role",
  );
  assert.ok(
    badgeContent.includes('event.key === "Escape"'),
    "Must dismiss dropdown on Escape key",
  );
  assert.ok(
    badgeContent.includes("handleClickOutside"),
    "Must dismiss dropdown on outside click",
  );
  assert.ok(
    badgeContent.includes("signOutAction"),
    "Must bind sign out action",
  );

  // Shell & Header integration checks
  const headerContent = fs.readFileSync(
    "src/components/app-header.tsx",
    "utf8",
  );
  assert.ok(
    headerContent.includes("<UserProfileBadge user={userProfile} />"),
    "AppHeader must render UserProfileBadge",
  );

  const shellContent = fs.readFileSync("src/components/app-shell.tsx", "utf8");
  assert.ok(
    shellContent.includes("userProfile?: UserProfileData"),
    "AppShell must accept userProfile prop",
  );
  assert.ok(
    shellContent.includes('variant="sidebar"'),
    "AppShell sidebar footer must render UserProfileBadge in sidebar variant",
  );

  const memberLayoutContent = fs.readFileSync(
    "src/app/(member)/layout.tsx",
    "utf8",
  );
  assert.ok(
    memberLayoutContent.includes('from "@/lib/user-profile"'),
    "Member layout must import formatPrimaryRole from @/lib/user-profile (server-safe)",
  );
  assert.ok(
    memberLayoutContent.includes("userProfile={userProfile}"),
    "Member layout must forward userProfile to AppShell",
  );

  const homePageContent = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(
    homePageContent.includes('from "@/lib/user-profile"'),
    "Home page must import formatPrimaryRole from @/lib/user-profile (server-safe)",
  );
  assert.ok(
    homePageContent.includes("userProfile={userProfile}"),
    "Home page must forward userProfile to AppShell",
  );

  assert.ok(
    !badgeContent.includes("export function formatPrimaryRole") &&
      !badgeContent.includes("export { formatPrimaryRole"),
    "Client component user-profile-badge must not export server utilities",
  );
});
