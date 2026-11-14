export type AuthCallbackDestination = "/portal" | "/reset-password";

/**
 * Normalizes the post-authentication callback destination.
 * Only `/reset-password` is honored as an alternate destination.
 */
export function resolveAuthCallbackDestination(
  nextParam: string | null,
): AuthCallbackDestination {
  return nextParam === "/reset-password" ? "/reset-password" : "/portal";
}

/**
 * Only non-recovery callbacks for email-confirmed sessions should check
 * whether a still-pending applicant needs their deferred signup receipt.
 * Welcome emails are sent solely on membership approval, never during auth callbacks.
 */
export function shouldNotifyPendingRegistrationOnCallback(params: {
  destination: AuthCallbackDestination;
  emailConfirmedAt: string | null | undefined;
}): boolean {
  return (
    params.destination !== "/reset-password" && Boolean(params.emailConfirmedAt)
  );
}
