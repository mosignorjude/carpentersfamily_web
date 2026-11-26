import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { DuesPageView } from "@/components/dues/dues-page-view";
import type { DuesPaymentRequestItem } from "@/components/dues/officer-dues-approvals-card";
import type { ReconciliationMember } from "@/components/dues/pre-launch-dues-reconciliation-card";
import { isAiReportsEnabled } from "@/lib/ai/provider.server";
import { canManageDues } from "@/lib/dues-governance.mjs";
import {
  type DuesStatusRow,
  loadMemberDuesLedger,
} from "@/lib/dues-ledger.server";
import { getDuesNotice } from "@/lib/dues-notices";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DuesMemberOption, DuesMonthOption } from "./dues-forms";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_PAGE_SIZE = 50;

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
    tab?: string;
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
  if (authError || !authData.user) redirect("/portal?notice=sign-in");

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
    (roles.has("executive") || roles.has("admin") || roles.has("president"));
  const canRecord = canManageDues(roles);
  const canCorrect = roles.has("admin") || roles.has("president");
  const canChangeRate = canCorrect;

  // Dedicated route redirect for legacy /dues?member_id=<otherUuid> links.
  if (
    isOfficer &&
    params.member_id &&
    uuidPattern.test(params.member_id) &&
    params.member_id !== ownProfile.id
  ) {
    const forward = new URLSearchParams();
    if (params.notice) forward.set("notice", params.notice);
    if (
      params.tab === "overview" ||
      params.tab === "history" ||
      params.tab === "audit"
    ) {
      forward.set("tab", params.tab);
    }
    const qs = forward.toString();
    redirect(`/dues/members/${params.member_id}${qs ? `?${qs}` : ""}`);
  }

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

  const member: DuesMemberOption = {
    id: ownProfile.id,
    full_name: ownProfile.full_name,
    username: ownProfile.username,
    status: ownProfile.status,
  };
  const targetMemberId = ownProfile.id;
  const invalidSelection = Boolean(
    isOfficer && params.member_id && !uuidPattern.test(params.member_id),
  );
  const paymentPage = pageNumber(params.payment_page);
  const auditPage = pageNumber(params.audit_page);

  const [ledger, incomeResult, paymentSettingsResult] = await Promise.all([
    loadMemberDuesLedger({
      supabase,
      targetMemberId,
      paymentPage,
      auditPage,
      pageSize: HISTORY_PAGE_SIZE,
      includeAudit: isOfficer,
    }),
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

  let pendingRequests: DuesPaymentRequestItem[] = [];
  const pendingMembersMap: Record<
    string,
    { full_name: string; username: string; roles: string[] }
  > = {};

  if (isOfficer) {
    const { data: pendingData } = await supabase
      .from("dues_payment_requests")
      .select(
        "id, member_id, amount_ngn, covered_months, payment_method, notes, status, created_at, reviewed_by, reviewed_at, review_reason",
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
        const [profilesRes, rolesRes, receiptsRes] = await Promise.all([
          supabase
            .from("member_profiles")
            .select("id, full_name, username")
            .in("id", pendingMemberIds),
          supabase
            .from("member_role_assignments")
            .select("member_id, role")
            .in("member_id", pendingMemberIds)
            .is("revoked_at", null),
          supabase
            .from("finance_receipts")
            .select(
              "id, dues_request_id, original_filename, content_type, size_bytes",
            )
            .in(
              "dues_request_id",
              pendingRequests.map((r) => r.id),
            ),
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

        if (receiptsRes.error) {
          for (const req of pendingRequests) req.receiptUnavailable = true;
        } else {
          const receiptsByReq = new Map(
            (receiptsRes.data ?? []).map((r) => [
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
        }
      }
    }
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
          .eq("role", "admin")
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

  const today = todayInWAT();
  const currentMonth = `${today.slice(0, 7)}-01`;
  const nextMonth = monthAfter(today.slice(0, 7));
  const unpaidMonths = ledger.duesRows.filter((row) => row.status === "unpaid");
  const availableMonths = unpaidMonths.map(toMonthOption);
  const openTotal = unpaidMonths.reduce(
    (total, row) => total + Number(row.amount_ngn ?? 0),
    0,
  );

  const isAdmin = !roleError && (roles.has("admin") || roles.has("president"));
  const isDuesExempt = !roleError && roles.has("admin");

  return (
    <DuesPageView
      actorNames={ledger.actorNames}
      aiEnabled={isAiReportsEnabled()}
      auditError={ledger.auditError}
      auditPage={auditPage}
      availableMonths={availableMonths}
      canChangeRate={canChangeRate}
      canCorrect={canCorrect}
      canRecord={canRecord}
      clubTotalIncome={incomeResult.error ? null : incomeResult.data}
      combinedAudit={ledger.duesAudit}
      coverageByPayment={ledger.coverageByPayment}
      currentMonth={currentMonth}
      detailedDataError={ledger.detailedDataError}
      duesRows={ledger.duesRows}
      initialTab={params.tab}
      invalidSelection={invalidSelection}
      isAdmin={isAdmin}
      isDuesExempt={isDuesExempt}
      isOfficer={isOfficer}
      member={member}
      memberListError={memberListError}
      members={members}
      nextMonth={nextMonth}
      notice={getDuesNotice(params.notice)}
      openTotal={openTotal}
      ownRequests={ledger.memberRequests}
      pageSize={HISTORY_PAGE_SIZE}
      paymentPage={paymentPage}
      paymentSettings={paymentSettings}
      payments={ledger.payments}
      pendingMembersMap={pendingMembersMap}
      pendingRequests={pendingRequests}
      rates={ledger.rates}
      reconciliationMembers={reconciliationMembers}
      roleError={Boolean(roleError)}
      targetMemberId={targetMemberId}
      totalAuditCount={ledger.auditCount}
      totalPaymentsCount={ledger.totalPaymentsCount}
      viewerId={authData.user.id}
      viewerRoles={Array.from(roles)}
    />
  );
}
