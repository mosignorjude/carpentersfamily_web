import Link from "next/link";
import { redirect } from "next/navigation";
import { ClubOverviewClient } from "@/components/reports/club-overview-client";
import { DataUnavailableCard } from "@/components/ui/state-screen";
import { isUuid } from "@/lib/ai/api-schemas";
import { isDocumentDraftType } from "@/lib/ai/document-drafts";
import { isAiReportsEnabled } from "@/lib/ai/provider.server";
import {
  listMeetingsForDrafting,
  loadAgmStatementSnapshot,
  loadTreasurerReportSnapshot,
} from "@/lib/reports/drafts.server";
import { loadOfficerReportLibrary } from "@/lib/reports/library.server";
import type { ReportsStudioMode } from "@/lib/reports/library-core";
import {
  loadActiveOfficerNarrative,
  loadClubFinanceSnapshot,
  loadClubOverviewSnapshot,
  loadDuesSnapshot,
} from "@/lib/reports/loaders.server";
import {
  currentMonthPeriodWAT,
  parseOverviewPeriod,
  previousMonthPeriodWAT,
} from "@/lib/reports/period";
import { loadCustomReportMetadata } from "@/lib/reports/spec-executor.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OfficerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    draftDoc?: string;
    event?: string;
    mode?: string;
  }>;
}) {
  const params = await searchParams;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DataUnavailableCard
          description="Could not connect to the database service."
          title="Officer Reports Unavailable"
        />
      </main>
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/portal?notice=sign-in");

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || profile?.status !== "active") {
    redirect("/portal?notice=sign-in");
  }

  const { data: isOfficer, error: officerError } =
    await supabase.rpc("is_club_officer");

  if (officerError) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 text-center space-y-2">
          <h1 className="text-lg font-bold text-[#3D291F]">
            Access could not be verified
          </h1>
          <p className="text-xs text-[#7A685D]">
            Officer permissions could not be verified right now.
          </p>
        </div>
      </main>
    );
  }

  if (isOfficer !== true) {
    return (
      <main className="max-w-xl mx-auto my-12 p-6 bg-white rounded-2xl border border-[#E5DDD3] text-center space-y-3">
        <h1 className="text-xl font-extrabold text-[#3D291F]">
          Officer access required
        </h1>
        <p className="text-xs text-[#5C4638]">
          Club overview reports and AI report summaries are restricted to club
          officers.
        </p>
        <Link
          className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-[#174C37] text-white text-xs font-bold"
          href="/portal"
        >
          Back to Home
        </Link>
      </main>
    );
  }

  const now = new Date();
  const currentMonth = currentMonthPeriodWAT(now);
  const previousMonth = previousMonthPeriodWAT(now);
  const currentYear =
    parseOverviewPeriod(`year:${currentMonth.periodLabel.slice(0, 4)}`) ??
    currentMonth;

  const selectedPeriod = parseOverviewPeriod(params.period) ?? currentMonth;

  const currentYearNumber = Number(currentMonth.periodLabel.slice(0, 4));
  const [
    snap,
    customMetadata,
    meetings,
    financeSnap,
    duesSnap,
    agmSnap,
    treasurerSnap,
  ] = await Promise.all([
    loadClubOverviewSnapshot(supabase, selectedPeriod),
    loadCustomReportMetadata(supabase),
    listMeetingsForDrafting(supabase),
    loadClubFinanceSnapshot(supabase, currentYearNumber),
    loadDuesSnapshot(supabase, currentYearNumber),
    loadAgmStatementSnapshot(supabase, currentYearNumber),
    loadTreasurerReportSnapshot(supabase, currentMonth),
  ]);

  const activeFingerprints: Record<string, string> = {};
  if (snap.kind === "ok") {
    activeFingerprints[`club_overview:${snap.periodStart}:${snap.periodEnd}`] =
      snap.fingerprint;
  }
  if (financeSnap.kind === "ok") {
    activeFingerprints.club_finance = financeSnap.fingerprint;
  }
  if (duesSnap.kind === "ok") {
    activeFingerprints[`dues:${currentYearNumber}`] = duesSnap.fingerprint;
  }
  if (agmSnap.kind === "ok") {
    activeFingerprints[`agm_statement:${currentYearNumber}`] =
      agmSnap.fingerprint;
  }
  if (treasurerSnap.kind === "ok") {
    activeFingerprints[
      `treasurer_report:${currentMonth.periodStart.slice(0, 7)}`
    ] = treasurerSnap.fingerprint;
  }

  const [initialNarrative, libraryItems] = await Promise.all([
    snap.kind === "ok"
      ? loadActiveOfficerNarrative(supabase, {
          reportType: "club_overview",
          scopeId: null,
          periodStart: snap.periodStart,
          periodEnd: snap.periodEnd,
          fingerprint: snap.fingerprint,
        })
      : Promise.resolve(null),
    loadOfficerReportLibrary(supabase, activeFingerprints),
  ]);

  const initialDraftDoc = isDocumentDraftType(params.draftDoc)
    ? params.draftDoc
    : undefined;
  const initialMeetingId = isUuid(params.event) ? params.event : undefined;
  const requestedMode: ReportsStudioMode | undefined =
    params.mode === "brief" ||
    params.mode === "drafts" ||
    params.mode === "custom" ||
    params.mode === "library"
      ? params.mode
      : initialDraftDoc || initialMeetingId
        ? "drafts"
        : undefined;

  return (
    <ClubOverviewClient
      aiEnabled={isAiReportsEnabled()}
      currentMonthParam={currentMonth.periodParam}
      currentYearParam={currentYear.periodParam}
      customMetadata={customMetadata}
      facts={snap.kind === "ok" ? snap.facts : null}
      initialDraftDoc={initialDraftDoc}
      initialMeetingId={initialMeetingId}
      initialMode={requestedMode}
      initialNarrative={initialNarrative}
      libraryItems={libraryItems}
      meetings={meetings}
      period={selectedPeriod}
      previousMonthParam={previousMonth.periodParam}
    />
  );
}
