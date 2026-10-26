import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/notifications/cron-auth";
import { evaluateNotificationReminders } from "@/lib/notifications/outbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const auth = authorizeCronRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await evaluateNotificationReminders();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[Notification Reminders] Evaluation failed:", error);
    return NextResponse.json(
      { error: "Reminder evaluation failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
