import Link from "next/link";
import { redirect } from "next/navigation";
import { ClubOverviewClient } from "@/components/reports/club-overview-client";
import { DataUnavailableCard } from "@/components/ui/state-screen";
import { isAiReportsEnabled } from "@/lib/ai/provider.server";
import {
  loadActiveOfficerNarrative,
  loadClubOverviewSnapshot,
} from "@/lib/reports/loaders.server";
import {
  currentMonthPeriodWAT,
  parseOverviewPeriod,
  previousMonthPeriodWAT,
} from "@/lib/reports/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OfficerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
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

  const snap = await loadClubOverviewSnapshot(supabase, selectedPeriod);
  const initialNarrative =
    snap.kind === "ok"
      ? await loadActiveOfficerNarrative(supabase, {
          reportType: "club_overview",
          scopeId: null,
          periodStart: snap.periodStart,
          periodEnd: snap.periodEnd,
          fingerprint: snap.fingerprint,
        })
      : null;

  return (
    <ClubOverviewClient
      aiEnabled={isAiReportsEnabled()}
      currentMonthParam={currentMonth.periodParam}
      currentYearParam={currentYear.periodParam}
      facts={snap.kind === "ok" ? snap.facts : null}
      initialNarrative={initialNarrative}
      period={selectedPeriod}
      previousMonthParam={previousMonth.periodParam}
    />
  );
}
