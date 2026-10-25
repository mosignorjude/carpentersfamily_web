import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { DuesPageView } from "@/components/dues/dues-page-view";
import type { DuesPaymentRequestItem } from "@/components/dues/officer-dues-approvals-card";
import type { ReconciliationMember } from "@/components/dues/pre-launch-dues-reconciliation-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DuesMemberOption, DuesMonthOption } from "./dues-forms";

type DuesStatusRow = {
  member_id: string;
  covered_month: string;
  amount_ngn: number | string | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

type PaymentRow = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  payment_date: string;
  recorded_by: string;
  recorded_at: string;
  corrected_at: string | null;
};

type DispositionRow = {
  payment_id: string | null;
  covered_month: string;
  amount_ngn: number | string;
  is_current: boolean;
};

type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_PAGE_SIZE = 50;

const notices: Record<string, string> = {
  saved: "The dues operation was recorded.",
  "rate-saved": "The next-month dues rate was saved.",
  denied: "You do not have permission to perform that operation.",
  "invalid-request": "The dues operation details were invalid.",
  "operation-failed":
    "The request was rejected. Check the member state, selected months, amount, rate, and reason, then try again.",
  "dues-request-submitted":
    "Your dues payment submission has been received and queued for officer review.",
  "dues-request-approved":
    "The dues payment submission was verified and approved into the club ledger.",
  "dues-request-rejected": "The dues payment submission was rejected.",
  "historical-dues-reconciled":
    "Historical pre-launch dues were successfully reconciled and marked cleared.",
  "invalid-reconciliation-months":
    "Selected months are invalid or outside the pre-launch window (Feb-Sep 2026).",
};

function todayInWAT() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthAfter(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const value = new Date(Date.UTC(yearValue, monthValue, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function toMonthOption(row: DuesStatusRow): DuesMonthOption {
  return {
    month: row.covered_month,
    amount: row.amount_ngn,
    label: formatMonth(row.covered_month),
  };
}

function pageNumber(value?: string) {
  if (!value || !/^\d{1,6}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    member_id?: string;
    payment_page?: string;
    audit_page?: string;
  }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Dues records unavailable</h1>
          <p>
            Member dues could not be loaded. No financial data was displayed.
          </p>
        </section>
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");

  const { data: ownProfile, error: ownProfileError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (ownProfileError || ownProfile?.status !== "active") {
    return (
      <main className="shell">
        <section className="panel narrow-panel">
          <p className="eyebrow">Dues privacy</p>
          <h1>Access denied</h1>
          <p>This account cannot access active member dues records.</p>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", authData.user.id)
    .is("revoked_at", null);
  const roles = new Set(
    roleError ? [] : (roleRows ?? []).map((row) => row.role),
  );
  const isOfficer =
    !roleError &&
    (roles.has("executive") || roles.has("admin") || roles.has("backup_admin"));
  const canRecord = isOfficer;
  const canWriteOff = isOfficer;
  const canCorrect = roles.has("admin") || roles.has("backup_admin");
  const canChangeRate = canCorrect;

  let members: DuesMemberOption[] = [
    {
      id: ownProfile.id,
      full_name: ownProfile.full_name,
      username: ownProfile.username,
      status: ownProfile.status,
    },
  ];
  let memberListError = false;
  if (isOfficer) {
    const { data: memberRows, error } = await supabase
      .from("member_profiles")
      .select("id, full_name, username, status")
      .in("status", ["active", "deactivated"])
      .order("full_name", { ascending: true })
      .limit(1000);
    memberListError = Boolean(error);
    if (memberRows) members = memberRows as DuesMemberOption[];
  }

  const requestedMemberId =
    isOfficer && params.member_id && uuidPattern.test(params.member_id)
      ? params.member_id
      : ownProfile.id;
  const selectedMember = members.find(
    (member) => member.id === requestedMemberId,
  );
  const member = selectedMember ?? {
    id: ownProfile.id,
    full_name: ownProfile.full_name,
    username: ownProfile.username,
    status: ownProfile.status,
  };
  const targetMemberId = selectedMember ? requestedMemberId : ownProfile.id;
  const invalidSelection = Boolean(
    isOfficer && params.member_id && !selectedMember,
  );
  const paymentPage = pageNumber(params.payment_page);
  const auditPage = pageNumber(params.audit_page);

  const [
    statusResult,
    paymentResult,
    rateResult,
    incomeResult,
    paymentSettingsResult,
  ] = await Promise.all([
    supabase
      .from("dues_month_status")
      .select(
        "member_id, covered_month, amount_ngn, status, due_date, is_overdue",
      )
      .eq("member_id", targetMemberId)
      .order("covered_month", { ascending: true })
      .limit(1200),
    supabase
      .from("dues_payments")
      .select(
        "id, member_id, amount_ngn, payment_date, recorded_by, recorded_at, corrected_at",
        { count: "exact" },
      )
      .eq("member_id", targetMemberId)
      .order("payment_date", { ascending: false })
      .order("recorded_at", { ascending: false })
      .range(
        paymentPage * HISTORY_PAGE_SIZE,
        (paymentPage + 1) * HISTORY_PAGE_SIZE - 1,
      ),
    supabase
      .from("dues_rates")
      .select(
        "id, effective_month, monthly_amount_ngn, changed_by, changed_at, reason",
      )
      .order("effective_month", { ascending: true })
      .limit(1200),
    supabase.rpc("club_dues_income_total"),
    supabase
      .from("club_payment_settings")
      .select("bank_name, account_number, account_name, instructions")
      .eq("id", "singleton")
      .maybeSingle(),
  ]);

  const paymentSettingsData = paymentSettingsResult.data;
  const paymentSettings = paymentSettingsData
    ? {
        bankName: paymentSettingsData.bank_name,
        accountNumber: paymentSettingsData.account_number,
        accountName: paymentSettingsData.account_name,
        instructions: paymentSettingsData.instructions ?? undefined,
      }
    : null;

  const duesRows = (statusResult.data ?? []) as DuesStatusRow[];
  const payments = (paymentResult.data ?? []) as PaymentRow[];
  const rates = rateResult.data ?? [];
  const paymentIds = payments.map((payment) => payment.id);
  let coverageRows: DispositionRow[] = [];
  let coverageError = false;
  if (paymentIds.length > 0) {
    const { data, error } = await supabase
      .from("dues_month_dispositions")
      .select("payment_id, covered_month, amount_ngn, is_current")
      .in("payment_id", paymentIds)
      .eq("is_current", true)
      .order("covered_month", { ascending: true });
    coverageError = Boolean(error);
    coverageRows = (data ?? []) as DispositionRow[];
  }

  let pendingRequests: DuesPaymentRequestItem[] = [];
  const pendingMembersMap: Record<
    string,
    { full_name: string; username: string; roles: string[] }
  > = {};

  if (isOfficer) {
    const { data: pendingData } = await supabase
      .from("dues_payment_requests")
      .select(
        "id, member_id, amount_ngn, covered_months, payment_method, payment_reference, notes, status, created_at, reviewed_by, reviewed_at, review_reason",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);

    if (pendingData) {
      pendingRequests = pendingData as DuesPaymentRequestItem[];
      const pendingMemberIds = [
        ...new Set(pendingRequests.map((r) => r.member_id)),
      ];
      if (pendingMemberIds.length > 0) {
        const [profilesRes, rolesRes] = await Promise.all([
          supabase
            .from("member_profiles")
            .select("id, full_name, username")
            .in("id", pendingMemberIds),
          supabase
            .from("member_role_assignments")
            .select("member_id, role")
            .in("member_id", pendingMemberIds)
            .is("revoked_at", null),
        ]);
        const rolesByMember = new Map<string, string[]>();
        for (const row of rolesRes.data ?? []) {
          const list = rolesByMember.get(row.member_id) ?? [];
          list.push(row.role);
          rolesByMember.set(row.member_id, list);
        }
        for (const p of profilesRes.data ?? []) {
          pendingMembersMap[p.id] = {
            full_name: p.full_name,
            username: p.username,
            roles: rolesByMember.get(p.id) ?? [],
          };
        }
      }
    }
  }

  let ownRequests: DuesPaymentRequestItem[] = [];
  const { data: ownRequestsData } = await supabase
    .from("dues_payment_requests")
    .select(
      "id, member_id, amount_ngn, covered_months, payment_method, payment_reference, notes, status, created_at, reviewed_by, reviewed_at, review_reason",
    )
    .eq("member_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (ownRequestsData) {
    ownRequests = ownRequestsData as DuesPaymentRequestItem[];
  }

  const allReqIds = [
    ...pendingRequests.map((r) => r.id),
    ...ownRequests.map((r) => r.id),
  ];
  if (allReqIds.length > 0) {
    const { data: receipts } = await supabase
      .from("finance_receipts")
      .select(
        "id, dues_request_id, original_filename, content_type, size_bytes",
      )
      .in("dues_request_id", allReqIds);
    if (receipts) {
      const receiptsByReq = new Map(
        receipts.map((r) => [
          r.dues_request_id,
          {
            id: r.id,
            filename: r.original_filename,
            contentType: r.content_type,
            sizeBytes: r.size_bytes,
          },
        ]),
      );
      for (const req of pendingRequests) {
        req.receipt = receiptsByReq.get(req.id) ?? null;
      }
      for (const req of ownRequests) {
        req.receipt = receiptsByReq.get(req.id) ?? null;
      }
    }
  }

  let duesAudit: AuditRow[] = [];
  let auditError = false;
  let auditCount = 0;
  if (isOfficer) {
    const auditResult = await supabase
      .from("audit_log")
      .select(
        "id, actor_id, action, entity_type, entity_id, target_member_id, before_data, after_data, reason, occurred_at",
        { count: "exact" },
      )
      .in("action", [
        "dues_payment_recorded",
        "dues_payment_corrected",
        "dues_month_written_off",
        "dues_rate_changed",
        "dues_payment_request_submitted",
        "dues_payment_request_approved",
        "dues_payment_request_rejected",
      ])
      .or(`target_member_id.eq.${targetMemberId},action.eq.dues_rate_changed`)
      .order("occurred_at", { ascending: false })
      .range(
        auditPage * HISTORY_PAGE_SIZE,
        (auditPage + 1) * HISTORY_PAGE_SIZE - 1,
      );
    auditError = Boolean(auditResult.error);
    duesAudit = (auditResult.data ?? []) as AuditRow[];
    auditCount = auditResult.count ?? 0;
  }

  const actorIds = [...new Set(duesAudit.map((entry) => entry.actor_id))];
  let actorNames = new Map<string, string>();
  if (isOfficer && actorIds.length > 0) {
    const { data } = await supabase
      .from("member_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    actorNames = new Map(
      (data ?? []).map((entry) => [entry.id, entry.full_name]),
    );
  }

  let reconciliationMembers: ReconciliationMember[] = [];
  if (isOfficer) {
    const [activeProfilesRes, adminRolesRes, preLaunchDispositionsRes] =
      await Promise.all([
        supabase
          .from("member_profiles")
          .select("id, full_name, username")
          .eq("status", "active")
          .order("full_name", { ascending: true })
          .limit(1000),
        supabase
          .from("member_role_assignments")
          .select("member_id")
          .in("role", ["admin", "backup_admin"])
          .is("revoked_at", null),
        supabase
          .from("dues_month_dispositions")
          .select("member_id, covered_month")
          .gte("covered_month", "2026-02-01")
          .lte("covered_month", "2026-09-01")
          .eq("is_current", true),
      ]);

    const adminIds = new Set(
      (adminRolesRes.data ?? []).map((r) => r.member_id),
    );
    const clearedMonthsByMember = new Map<string, string[]>();
    for (const row of preLaunchDispositionsRes.data ?? []) {
      const list = clearedMonthsByMember.get(row.member_id) ?? [];
      list.push(row.covered_month);
      clearedMonthsByMember.set(row.member_id, list);
    }

    const nonAdminActive = (activeProfilesRes.data ?? []).filter(
      (profile) => !adminIds.has(profile.id),
    );

    reconciliationMembers = nonAdminActive.map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      username: profile.username,
      avatarUrl: null,
      clearedMonths: clearedMonthsByMember.get(profile.id) ?? [],
    }));
  }

  const notice = params.notice ? notices[params.notice] : undefined;
  const today = todayInWAT();
  const currentMonth = `${today.slice(0, 7)}-01`;
  const nextMonth = monthAfter(today.slice(0, 7));
  const unpaidMonths = duesRows.filter((row) => row.status === "unpaid");
  const pastUnpaidMonths = unpaidMonths
    .filter((row) => row.covered_month < currentMonth)
    .map(toMonthOption);
  const availableMonths = unpaidMonths.map(toMonthOption);
  const coverageByPayment = new Map<string, string[]>();
  for (const coverage of coverageRows) {
    if (!coverage.payment_id) continue;
    const months = coverageByPayment.get(coverage.payment_id) ?? [];
    months.push(coverage.covered_month);
    coverageByPayment.set(coverage.payment_id, months);
  }
  const combinedAudit = duesAudit;
  const openTotal = unpaidMonths.reduce(
    (total, row) => total + Number(row.amount_ngn ?? 0),
    0,
  );
  const detailedDataError = Boolean(
    statusResult.error || paymentResult.error || coverageError,
  );

  const isAdmin =
    !roleError && (roles.has("admin") || roles.has("backup_admin"));

  return (
    <DuesPageView
      actorNames={actorNames}
      auditError={auditError}
      auditPage={auditPage}
      availableMonths={availableMonths}
      canChangeRate={canChangeRate}
      canCorrect={canCorrect}
      canRecord={canRecord}
      canWriteOff={canWriteOff}
      clubTotalIncome={incomeResult.error ? null : incomeResult.data}
      combinedAudit={combinedAudit}
      coverageByPayment={coverageByPayment}
      currentMonth={currentMonth}
      detailedDataError={detailedDataError}
      duesRows={duesRows}
      invalidSelection={invalidSelection}
      isAdmin={isAdmin}
      isOfficer={isOfficer}
      member={member}
      memberListError={memberListError}
      members={members}
      nextMonth={nextMonth}
      notice={notice}
      openTotal={openTotal}
      ownRequests={ownRequests}
      pageSize={HISTORY_PAGE_SIZE}
      pastUnpaidMonths={pastUnpaidMonths}
      paymentPage={paymentPage}
      paymentSettings={paymentSettings}
      payments={payments}
      pendingMembersMap={pendingMembersMap}
      pendingRequests={pendingRequests}
      rates={rates}
      reconciliationMembers={reconciliationMembers}
      roleError={Boolean(roleError)}
      targetMemberId={targetMemberId}
      today={today}
      totalAuditCount={auditCount}
      totalPaymentsCount={paymentResult.count ?? 0}
      viewerId={authData.user.id}
      viewerRoles={Array.from(roles)}
    />
  );
}
