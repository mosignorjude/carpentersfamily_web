import net from "node:net";
import { render, toPlainText } from "@react-email/components";
import type { ReactNode } from "react";
import { Resend } from "resend";
import { getEmailConfig } from "@/lib/email/config";
import { TestVerificationEmail } from "@/lib/email/templates/test-verification-email";

// Increase Node's Happy Eyeballs per-address attempt timeout from 250ms to 5000ms
// so higher-latency international routes to api.resend.com do not prematurely abort.
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  react?: ReactNode;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  from?: string;
  tags?: { name: string; value: string }[];
}

export type EmailActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; statusCode?: number | null };

let cachedResendClient: { apiKey: string; client: Resend } | null = null;

export function getResendClient(): Resend | null {
  const { apiKey } = getEmailConfig();
  if (!apiKey) return null;

  if (!cachedResendClient || cachedResendClient.apiKey !== apiKey) {
    cachedResendClient = {
      apiKey,
      client: new Resend(apiKey),
    };
  }

  return cachedResendClient.client;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<EmailActionResult> {
  const config = getEmailConfig();
  const resend = getResendClient();

  if (!resend) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY is not configured. Add it to .env.local before sending emails.",
    };
  }

  try {
    let html = input.html;
    let text = input.text;

    if (input.react) {
      html = await render(input.react);
      if (!text) {
        text = toPlainText(html);
      }
    }

    if (!html && !text) {
      return {
        ok: false,
        error: "Email payload requires at least one of react, html, or text.",
      };
    }

    const basePayload = {
      from: input.from ?? config.fromEmail,
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo ?? config.replyToEmail,
      ...(input.tags ? { tags: input.tags } : {}),
    };

    const { data, error } = await resend.emails.send(
      html
        ? { ...basePayload, html, ...(text ? { text } : {}) }
        : { ...basePayload, text: text as string },
    );

    if (error || !data?.id) {
      return {
        ok: false,
        error: error?.message ?? "Resend did not return an email delivery ID.",
        statusCode: error?.statusCode ?? null,
      };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error sending email.";
    return { ok: false, error: message };
  }
}

export async function sendEmailBatch(
  recipients: readonly string[],
  input: Omit<SendEmailInput, "to">,
): Promise<{ ok: boolean; sentCount: number; error?: string }> {
  const uniqueRecipients = Array.from(
    new Set(
      recipients
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  );

  if (uniqueRecipients.length === 0) {
    return { ok: true, sentCount: 0 };
  }

  if (uniqueRecipients.length === 1) {
    const singleResult = await sendEmail({
      ...input,
      to: uniqueRecipients[0],
    });
    return singleResult.ok
      ? { ok: true, sentCount: 1 }
      : { ok: false, sentCount: 0, error: singleResult.error };
  }

  const config = getEmailConfig();
  const resend = getResendClient();
  if (!resend) {
    return {
      ok: false,
      sentCount: 0,
      error: "RESEND_API_KEY is not configured.",
    };
  }

  try {
    let html = input.html;
    let text = input.text;

    if (input.react) {
      html = await render(input.react);
      if (!text) {
        text = toPlainText(html);
      }
    }

    if (!html && !text) {
      return {
        ok: false,
        sentCount: 0,
        error: "Email payload requires at least one of react, html, or text.",
      };
    }

    let sentCount = 0;
    const batchSize = 100;

    for (let index = 0; index < uniqueRecipients.length; index += batchSize) {
      const chunk = uniqueRecipients.slice(index, index + batchSize);
      const batchPayload = chunk.map((recipient) => {
        const base = {
          from: input.from ?? config.fromEmail,
          to: recipient,
          subject: input.subject,
          replyTo: input.replyTo ?? config.replyToEmail,
          ...(input.tags ? { tags: input.tags } : {}),
        };
        return html
          ? { ...base, html, ...(text ? { text } : {}) }
          : { ...base, text: text as string };
      });

      const { error } = await resend.batch.send(batchPayload);
      if (error) {
        return { ok: false, sentCount, error: error.message };
      }
      sentCount += chunk.length;
    }

    return { ok: true, sentCount };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error sending email batch.";
    return { ok: false, sentCount: 0, error: message };
  }
}

export async function forwardReceivedContactEmail(
  emailId: string,
): Promise<EmailActionResult> {
  const config = getEmailConfig();
  const resend = getResendClient();

  if (!resend) {
    return {
      ok: false,
      error: "RESEND_API_KEY is not configured for inbound email forwarding.",
    };
  }

  try {
    const { data, error } = await resend.emails.receiving.forward({
      emailId,
      to: config.forwardToEmail,
      from: config.fromEmail,
    });

    if (error || !data?.id) {
      return {
        ok: false,
        error:
          error?.message ??
          "Resend failed to forward the received contact email.",
        statusCode: error?.statusCode ?? null,
      };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error forwarding received email.";
    return { ok: false, error: message };
  }
}

export async function sendVerificationTestEmail(
  recipientEmail?: string,
): Promise<EmailActionResult> {
  const config = getEmailConfig();
  const targetEmail = recipientEmail?.trim() || config.forwardToEmail;

  return sendEmail({
    to: targetEmail,
    subject: "Carpenters Family — Resend Email Verification",
    react: TestVerificationEmail({
      recipientEmail: targetEmail,
      portalUrl: config.siteUrl,
    }),
    tags: [{ name: "category", value: "verification" }],
  });
}
