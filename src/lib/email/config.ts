export const DEFAULT_FROM_EMAIL =
  "Carpenters Family <info@mail.carpentersfamily.com.ng>";
export const DEFAULT_REPLY_TO_EMAIL = "contact@mail.carpentersfamily.com.ng";
export const DEFAULT_FORWARD_TO_EMAIL = "carpentersfamily001@gmail.com";

export interface EmailConfig {
  apiKey: string | null;
  webhookSecret: string | null;
  fromEmail: string;
  replyToEmail: string;
  forwardToEmail: string;
  siteUrl: string;
}

function readCleanEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || null;

  return {
    apiKey,
    webhookSecret,
    fromEmail: readCleanEnv(process.env.RESEND_FROM_EMAIL, DEFAULT_FROM_EMAIL),
    replyToEmail: readCleanEnv(
      process.env.RESEND_REPLY_TO_EMAIL,
      DEFAULT_REPLY_TO_EMAIL,
    ),
    forwardToEmail: readCleanEnv(
      process.env.RESEND_FORWARD_TO_EMAIL,
      DEFAULT_FORWARD_TO_EMAIL,
    ),
    siteUrl: readCleanEnv(
      process.env.NEXT_PUBLIC_SITE_URL,
      "http://127.0.0.1:3000",
    ),
  };
}

export function extractEmailAddress(rawAddress: string): string {
  const trimmed = rawAddress.trim().toLowerCase();
  const bracketMatch = trimmed.match(/<([^<>]+)>/);
  return (bracketMatch ? bracketMatch[1] : trimmed).trim();
}

export function isContactRecipient(
  recipients: readonly string[] | undefined,
  contactEmail = DEFAULT_REPLY_TO_EMAIL,
): boolean {
  if (!recipients || recipients.length === 0) return false;
  const normalizedTarget = extractEmailAddress(contactEmail);
  return recipients.some(
    (recipient) => extractEmailAddress(recipient) === normalizedTarget,
  );
}
