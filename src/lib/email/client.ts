import net from "node:net";
import { render, toPlainText } from "@react-email/components";
import type { ReactNode } from "react";
import {
  type CreateBatchEmailOptions,
  type CreateEmailOptions,
  Resend,
} from "resend";
import { getEmailConfig } from "@/lib/email/config";
import { TestVerificationEmail } from "@/lib/email/templates/test-verification-email";
import {
  buildBatchIdempotencyKey,
  classifyProviderFailure,
  normalizeIdempotencyKey,
  PACE_MS,
  type RateLimitKind,
} from "@/lib/notifications/outbox-worker";

// Increase Node's Happy Eyeballs per-address attempt timeout from 250ms to 5000ms
// so higher-latency international routes to api.resend.com do not prematurely abort.
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
}

export interface EmailTag {
  name: string;
  value: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  react?: ReactNode;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  from?: string;
  tags?: EmailTag[];
}

export interface PreparedEmail {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  from?: string;
  tags?: EmailTag[];
}

export interface SendEmailOptions {
  idempotencyKey?: string;
}

export type EmailActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      statusCode?: number | null;
      name?: string | null;
      rateLimit?: RateLimitKind | null;
    };

export type PreparedBatchResult =
  | {
      ok: true;
      data: { id: string }[];
      errors?: { index: number; message: string }[];
    }
  | {
      ok: false;
      error: string;
      statusCode: number | null;
      name: string | null;
      rateLimit: RateLimitKind | null;
    };

const BATCH_SIZE = 100;

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

function buildEmailPayload(input: PreparedEmail): CreateEmailOptions {
  const config = getEmailConfig();
  const base = {
    from: input.from ?? config.fromEmail,
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo ?? config.replyToEmail,
    ...(input.tags ? { tags: input.tags } : {}),
  };

  return input.html
    ? { ...base, html: input.html, ...(input.text ? { text: input.text } : {}) }
    : { ...base, text: input.text ?? "" };
}

function buildBatchPayload(input: PreparedEmail): CreateBatchEmailOptions {
  const config = getEmailConfig();
  const base = {
    from: input.from ?? config.fromEmail,
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo ?? config.replyToEmail,
    ...(input.tags ? { tags: input.tags } : {}),
  };

  return input.html
    ? { ...base, html: input.html, ...(input.text ? { text: input.text } : {}) }
    : { ...base, text: input.text ?? "" };
}

function missingApiKeyResult(): EmailActionResult {
  return {
    ok: false,
    error:
      "RESEND_API_KEY is not configured. Add it to .env.local before sending emails.",
  };
}

export async function sendPreparedEmail(
  input: PreparedEmail,
  options: SendEmailOptions = {},
): Promise<EmailActionResult> {
  const resend = getResendClient();
  if (!resend) return missingApiKeyResult();

  try {
    const payload = buildEmailPayload(input);
    const { data, error } = options.idempotencyKey
      ? await resend.emails.send(payload, {
          idempotencyKey: normalizeIdempotencyKey(options.idempotencyKey),
        })
      : await resend.emails.send(payload);

    if (error || !data?.id) {
      const failure = classifyProviderFailure(
        error ?? new Error("Resend did not return an email delivery ID."),
      );
      return {
        ok: false,
        error: failure.message,
        statusCode: failure.statusCode,
        name: failure.name,
        rateLimit: failure.rateLimit,
      };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    const failure = classifyProviderFailure(err);
    return {
      ok: false,
      error: failure.message,
      statusCode: failure.statusCode,
      name: failure.name,
      rateLimit: failure.rateLimit,
    };
  }
}

export async function sendPreparedEmailBatch(
  messages: readonly PreparedEmail[],
  options: SendEmailOptions = {},
): Promise<PreparedBatchResult> {
  if (messages.length === 0) {
    return { ok: true, data: [] };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      ok: false,
      error: "RESEND_API_KEY is not configured.",
      statusCode: null,
      name: null,
      rateLimit: null,
    };
  }

  const chunks: PreparedEmail[][] = [];
  for (let index = 0; index < messages.length; index += BATCH_SIZE) {
    chunks.push(messages.slice(index, index + BATCH_SIZE));
  }

  const providerIds: { id: string }[] = [];
  const providerErrors: { index: number; message: string }[] = [];

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkKey =
        chunks.length === 1 && options.idempotencyKey
          ? normalizeIdempotencyKey(options.idempotencyKey)
          : options.idempotencyKey
            ? `${normalizeIdempotencyKey(options.idempotencyKey)}:chunk:${index + 1}`
            : buildBatchIdempotencyKey(
                chunk.map((message) =>
                  Array.isArray(message.to) ? message.to.join(",") : message.to,
                ),
              );

      const { data, error } = await resend.batch.send(
        chunk.map(buildBatchPayload),
        { idempotencyKey: chunkKey, batchValidation: "permissive" },
      );

      if (error || !data) {
        const failure = classifyProviderFailure(
          error ?? new Error("Resend did not return a batch response."),
        );
        return {
          ok: false,
          error: failure.message,
          statusCode: failure.statusCode,
          name: failure.name,
          rateLimit: failure.rateLimit,
        };
      }

      providerIds.push(...data.data);
      const chunkOffset = index * BATCH_SIZE;
      for (const chunkError of data.errors ?? []) {
        providerErrors.push({
          index: chunkOffset + chunkError.index,
          message: chunkError.message,
        });
      }

      if (index < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, PACE_MS));
      }
    }

    return {
      ok: true,
      data: providerIds,
      ...(providerErrors.length > 0 ? { errors: providerErrors } : {}),
    };
  } catch (err) {
    const failure = classifyProviderFailure(err);
    return {
      ok: false,
      error: failure.message,
      statusCode: failure.statusCode,
      name: failure.name,
      rateLimit: failure.rateLimit,
    };
  }
}

async function renderInput(
  input: SendEmailInput,
): Promise<{ html?: string; text?: string } | null> {
  let html = input.html;
  let text = input.text;

  if (input.react) {
    html = await render(input.react);
    if (!text) {
      text = toPlainText(html);
    }
  }

  if (!html && !text) return null;
  return { html, text };
}

export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions = {},
): Promise<EmailActionResult> {
  try {
    const rendered = await renderInput(input);
    if (!rendered) {
      return {
        ok: false,
        error: "Email payload requires at least one of react, html, or text.",
      };
    }

    return await sendPreparedEmail(
      {
        to: input.to,
        subject: input.subject,
        from: input.from,
        replyTo: input.replyTo,
        tags: input.tags,
        ...rendered,
      },
      options,
    );
  } catch (err) {
    const failure = classifyProviderFailure(err);
    return {
      ok: false,
      error: failure.message,
      statusCode: failure.statusCode,
      name: failure.name,
      rateLimit: failure.rateLimit,
    };
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

  try {
    const rendered = await renderInput({ ...input, to: uniqueRecipients[0] });
    if (!rendered) {
      return {
        ok: false,
        sentCount: 0,
        error: "Email payload requires at least one of react, html, or text.",
      };
    }

    if (uniqueRecipients.length === 1) {
      const singleResult = await sendPreparedEmail({
        to: uniqueRecipients[0],
        subject: input.subject,
        from: input.from,
        replyTo: input.replyTo,
        tags: input.tags,
        ...rendered,
      });
      return singleResult.ok
        ? { ok: true, sentCount: 1 }
        : { ok: false, sentCount: 0, error: singleResult.error };
    }

    const result = await sendPreparedEmailBatch(
      uniqueRecipients.map((recipient) => ({
        to: recipient,
        subject: input.subject,
        from: input.from,
        replyTo: input.replyTo,
        tags: input.tags,
        ...rendered,
      })),
    );

    if (!result.ok) {
      return { ok: false, sentCount: 0, error: result.error };
    }

    if (result.errors?.length) {
      return {
        ok: false,
        sentCount: result.data.length,
        error: result.errors.map((error) => error.message).join("; "),
      };
    }

    return { ok: true, sentCount: result.data.length };
  } catch (err) {
    return {
      ok: false,
      sentCount: 0,
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error sending email batch.",
    };
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
