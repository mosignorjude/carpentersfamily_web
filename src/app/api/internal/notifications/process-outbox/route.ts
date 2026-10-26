import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/notifications/cron-auth";
import { processOutboxBatch } from "@/lib/notifications/outbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestedLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit");
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 200;
  return Math.min(parsed, 200);
}

async function handle(request: Request) {
  const auth = authorizeCronRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await processOutboxBatch(requestedLimit(request));
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Notification Outbox] Worker tick failed:", error);
    return NextResponse.json(
      { error: "Notification outbox processing failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
