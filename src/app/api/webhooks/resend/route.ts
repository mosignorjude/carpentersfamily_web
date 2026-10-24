import { type NextRequest, NextResponse } from "next/server";
import {
  forwardReceivedContactEmail,
  getResendClient,
} from "@/lib/email/client";
import { getEmailConfig, isContactRecipient } from "@/lib/email/config";

export async function POST(request: NextRequest) {
  const config = getEmailConfig();
  const resend = getResendClient();

  if (!resend || !config.webhookSecret) {
    return NextResponse.json(
      {
        error:
          "Resend webhook is not configured. Ensure RESEND_API_KEY and RESEND_WEBHOOK_SECRET are set.",
      },
      { status: 503 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Resend webhook signature headers." },
      { status: 400 },
    );
  }

  const rawPayload = await request.text();

  let event: ReturnType<typeof resend.webhooks.verify>;
  try {
    event = resend.webhooks.verify({
      payload: rawPayload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret: config.webhookSecret,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid Resend webhook signature." },
      { status: 400 },
    );
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const allRecipients = [
    ...(event.data.to ?? []),
    ...(event.data.cc ?? []),
    ...(event.data.bcc ?? []),
    ...(event.data.received_for ?? []),
  ];

  if (!isContactRecipient(allRecipients, config.replyToEmail)) {
    return NextResponse.json({
      received: true,
      forwarded: false,
      reason: "Recipient does not match club contact address.",
    });
  }

  const forwardResult = await forwardReceivedContactEmail(event.data.email_id);

  if (!forwardResult.ok) {
    return NextResponse.json({ error: forwardResult.error }, { status: 502 });
  }

  return NextResponse.json({
    received: true,
    forwarded: true,
    forwardedEmailId: forwardResult.id,
    forwardedTo: config.forwardToEmail,
  });
}
