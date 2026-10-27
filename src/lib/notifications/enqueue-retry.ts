export interface NotificationEnqueueRetryOptions {
  operation: "email" | "broadcast";
  idempotencyKey: string;
  maxAttempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
}

export class NotificationEnqueueError extends Error {
  constructor(
    operation: NotificationEnqueueRetryOptions["operation"],
    idempotencyKey: string,
    attempts: number,
    cause?: unknown,
  ) {
    const attemptsMessage =
      attempts === 0
        ? "before an RPC attempt"
        : `after ${attempts} attempt${attempts === 1 ? "" : "s"}`;
    super(
      `Notification ${operation} enqueue failed ${attemptsMessage} (idempotency key: ${idempotencyKey}).`,
      { cause },
    );
    this.name = "NotificationEnqueueError";
  }
}

function retryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;

  const failure = error as Record<string, unknown>;
  const status = failure.statusCode ?? failure.status;
  if (typeof status === "number") return status === 429 || status >= 500;

  const code = typeof failure.code === "string" ? failure.code : "";
  if (!code) return true;

  return /^(08|40|53|55)/.test(code) || ["PGRST000", "PGRST002"].includes(code);
}

const defaultDelay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withNotificationEnqueueRetry<T>(
  enqueue: () => Promise<T>,
  options: NotificationEnqueueRetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      return await enqueue();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !retryable(error)) break;
      await delay(100 * 2 ** (attempt - 1));
    }
  }

  throw new NotificationEnqueueError(
    options.operation,
    options.idempotencyKey,
    attempts,
    lastError,
  );
}
