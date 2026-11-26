import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  DuesMemberOption,
  DuesMonthOption,
} from "@/app/(member)/dues/dues-forms";
import { signOutAction } from "@/app/actions";
import { MemberDuesLedgerView } from "@/components/dues/member-dues-ledger-view";
import {
  canManageDues,
  canRecordDuesForMember,
} from "@/lib/dues-governance.mjs";
import {
  type DuesStatusRow,
  loadMemberDuesLedger,
} from "@/lib/dues-ledger.server";
import { getDuesNotice } from "@/lib/dues-notices";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export default async function OfficerMemberDuesLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{
    notice?: string;
    payment_page?: string;
    audit_page?: string;
    tab?: string;
  }>;
}) {
  const { memberId } = await params;
  const query = await searchParams;

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
    .select("id, status")
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
  const isOfficer = !roleError && canManageDues(roles);
  if (!isOfficer) {
    redirect("/dues?notice=denied");
  }

  const { data: memberRows, error: memberRowsError } = await supabase
    .from("member_profiles")
    .select("id, full_name, username, status")
    .in("status", ["active", "deactivated"])
    .order("full_name", { ascending: true })
    .limit(1000);

  const members = (memberRows ?? []) as DuesMemberOption[];
  const member = uuidPattern.test(memberId)
    ? members.find((entry) => entry.id === memberId)
    : undefined;

  if (!member) {
    return (
      <main className="max-w-3xl mx-auto p-6 sm:p-10 space-y-4">
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-3">
          <h1 className="text-xl font-extrabold text-[#3D291F]">
            Member dues ledger not found
          </h1>
          <p className="text-xs sm:text-sm text-[#54433A]">
            The requested member could not be found or is no longer active.
          </p>
          <Link
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors"
            href="/dues?tab=officer"
          >
            Back to Officer Treasury
          </Link>
        </div>
      </main>
    );
  }

  const paymentPage = pageNumber(query.payment_page);
  const auditPage = pageNumber(query.audit_page);

  const [ledger, incomeResult] = await Promise.all([
    loadMemberDuesLedger({
      supabase,
      targetMemberId: member.id,
      paymentPage,
      auditPage,
      pageSize: HISTORY_PAGE_SIZE,
      includeAudit: true,
    }),
    supabase.rpc("club_dues_income_total"),
  ]);

  const recordCheck = canRecordDuesForMember({
    actorId: authData.user.id,
    actorRoles: roles,
    targetMemberId: member.id,
    targetRoles: ledger.targetRoles,
  });

  const today = todayInWAT();
  const currentMonth = `${today.slice(0, 7)}-01`;
  const nextMonth = monthAfter(today.slice(0, 7));
  const unpaidMonths = ledger.duesRows.filter((row) => row.status === "unpaid");
  const pastUnpaidMonths = unpaidMonths
    .filter((row) => row.covered_month < currentMonth)
    .map(toMonthOption);
  const availableMonths = unpaidMonths.map(toMonthOption);
  const openTotal = unpaidMonths.reduce(
    (total, row) => total + Number(row.amount_ngn ?? 0),
    0,
  );
  const canCorrect = roles.has("admin") || roles.has("president");

  return (
    <MemberDuesLedgerView
      actorNames={ledger.actorNames}
      auditError={ledger.auditError}
      auditPage={auditPage}
      availableMonths={availableMonths}
      canAttachReceipt={recordCheck.allowed}
      canCorrect={canCorrect}
      canRecord={isOfficer}
      canRecordForTarget={recordCheck.allowed}
      canWriteOff={isOfficer}
      clubTotalIncome={incomeResult.error ? null : incomeResult.data}
      combinedAudit={ledger.duesAudit}
      coverageByPayment={ledger.coverageByPayment}
      currentMonth={currentMonth}
      detailedDataError={ledger.detailedDataError}
      duesRows={ledger.duesRows}
      initialTab={query.tab}
      member={member}
      memberListError={Boolean(memberRowsError)}
      memberRequests={ledger.memberRequests}
      members={members}
      nextMonth={nextMonth}
      notice={getDuesNotice(query.notice)}
      openTotal={openTotal}
      pageSize={HISTORY_PAGE_SIZE}
      pastUnpaidMonths={pastUnpaidMonths}
      paymentPage={paymentPage}
      payments={ledger.payments}
      rates={ledger.rates}
      recordBlockedReason={recordCheck.reason}
      targetIsDuesExempt={ledger.targetIsDuesExempt}
      today={today}
      totalAuditCount={ledger.auditCount}
      totalPaymentsCount={ledger.totalPaymentsCount}
    />
  );
}
