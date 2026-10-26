import "server-only";

import { isValidCronToken } from "@/lib/notifications/cron-token";

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizeCronRequest(headers: Headers): CronAuthorization {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    };
  }

  if (!isValidCronToken(headers.get("authorization"), secret)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
