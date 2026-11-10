import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/notifications/cron-auth";
import { generateAndNotifyMonthlyOverview } from "@/lib/reports/monthly-overview.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(request: Request) {
  const auth = authorizeCronRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await generateAndNotifyMonthlyOverview();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[Monthly Overview Cron] Generation failed:", error);
    return NextResponse.json(
      { error: "Monthly overview generation failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
