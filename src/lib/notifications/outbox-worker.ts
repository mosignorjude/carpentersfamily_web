import { createHash } from "node:crypto";

export const MAX_BATCH_SIZE = 100;
export const PACE_MS = 600;
export const RETRY_DELAY_SECONDS = 60;
export const DEFAULT_CLAIM_LIMIT = 200;

export interface OutboxJob {
  id: string;
  idempotencyKey: string;
  triggerType: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  heading: string;
  bodyText: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  batchGroupKey: string | null;
  templatePayload: Record<string, unknown>;
}

export interface ProviderBatchResult {
  data: { id: string }[];
  errors?: { index: number; message: string }[];
}

export interface OutboxWorkerDependencies {
  claimJobs(limit: number): Promise<OutboxJob[]>;
  sendEmail(
    job: OutboxJob,
    options: { idempotencyKey: string },
  ): Promise<{ id: string }>;
  sendEmailBatch(
    jobs: OutboxJob[],
    options: { idempotencyKey: string },
  ): Promise<ProviderBatchResult>;
  completeJobs(jobs: OutboxJob[], providerIds: string[]): Promise<void>;
  rescheduleJobs(
    jobs: OutboxJob[],
    reason: string,
    delaySeconds: number,
    paused: boolean,
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): Date;
}

export interface ProcessOutboxSummary {
  claimed: number;
  sent: number;
  failed: number;
  pausedForRateLimit: boolean;
  providerCalls: number;
}

export type RateLimitKind = "per_second" | "daily_quota" | "monthly_quota";

export interface ProviderFailure {
  statusCode: number | null;
  name: string | null;
  message: string;
  rateLimit: RateLimitKind | null;
}

interface BatchUnit {
  kind: "batch";
  jobs: OutboxJob[];
  idempotencyKey: string;
}

interface SingleUnit {
  kind: "single";
  jobs: [OutboxJob];
  idempotencyKey: string;
}

type DispatchUnit = BatchUnit | SingleUnit;

export function chunkJobs<T>(jobs: readonly T[], size = MAX_BATCH_SIZE): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < jobs.length; index += chunkSize) {
    chunks.push(jobs.slice(index, index + chunkSize));
  }
  return chunks;
}

export function normalizeIdempotencyKey(key: string): string {
  return key.trim().toLowerCase().slice(0, 255);
}

export function buildBatchIdempotencyKey(keys: readonly string[]): string {
  const canonical = [...keys]
    .map(normalizeIdempotencyKey)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `outboxbatch:${digest.slice(0, 48)}`;
}

export function classifyProviderFailure(error: unknown): ProviderFailure {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const response =
    typeof record.response === "object" && record.response !== null
      ? (record.response as Record<string, unknown>)
      : {};

  const statusCandidate =
    record.statusCode ?? record.status ?? response.status ?? null;
  const statusCode =
    typeof statusCandidate === "number" ? statusCandidate : null;
  const name = typeof record.name === "string" ? record.name : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof record.message === "string"
        ? record.message
        : "Unexpected Resend dispatch error.";
  const haystack = `${name ?? ""} ${message}`.toLowerCase();

  let rateLimit: RateLimitKind | null = null;
  if (
    statusCode === 429 ||
    /quota|rate_limit|too many requests/.test(haystack)
  ) {
    if (/daily/.test(haystack)) {
      rateLimit = "daily_quota";
    } else if (/monthly/.test(haystack)) {
      rateLimit = "monthly_quota";
    } else {
      rateLimit = "per_second";
    }
  }

  return { statusCode, name, message, rateLimit };
}

export function rateLimitPauseSeconds(kind: RateLimitKind, now: Date): number {
  if (kind === "per_second") return 60;

  const nextUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    5,
    0,
  );
  return Math.max(0, Math.ceil((nextUtcDay - now.getTime()) / 1000));
}

export function buildDispatchUnits(jobs: readonly OutboxJob[]): DispatchUnit[] {
  const groups = new Map<string, OutboxJob[]>();
  const singles: OutboxJob[] = [];

  for (const job of jobs) {
    if (job.batchGroupKey) {
      const group = groups.get(job.batchGroupKey) ?? [];
      group.push(job);
      groups.set(job.batchGroupKey, group);
    } else {
      singles.push(job);
    }
  }

  const units: DispatchUnit[] = [];

  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (left, right) =>
        left.idempotencyKey.localeCompare(right.idempotencyKey) ||
        left.id.localeCompare(right.id),
    );
    for (const chunk of chunkJobs(ordered)) {
      units.push({
        kind: "batch",
        jobs: chunk,
        idempotencyKey: buildBatchIdempotencyKey(
          chunk.map((job) => job.idempotencyKey),
        ),
      });
    }
  }

  for (const job of singles) {
    units.push({
      kind: "single",
      jobs: [job],
      idempotencyKey: normalizeIdempotencyKey(job.idempotencyKey),
    });
  }

  return units;
}

function mapBatchResult(
  jobs: readonly OutboxJob[],
  result: ProviderBatchResult,
): {
  completed: { jobs: OutboxJob[]; ids: string[] };
  failed: { jobs: OutboxJob[]; reason: string };
} {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const failedIndexes = new Map(
    errors.map((error) => [error.index, error.message]),
  );
  const data = Array.isArray(result.data) ? result.data : [];

  const completedJobs: OutboxJob[] = [];
  const completedIds: string[] = [];
  const failedJobs: OutboxJob[] = [];
  const failureMessages: string[] = [];
  let dataIndex = 0;

  jobs.forEach((job, index) => {
    const errorMessage = failedIndexes.get(index);
    if (errorMessage !== undefined) {
      failedJobs.push(job);
      failureMessages.push(errorMessage);
      return;
    }

    const providerId = data[dataIndex++]?.id;
    if (typeof providerId === "string" && providerId.length > 0) {
      completedJobs.push(job);
      completedIds.push(providerId);
      return;
    }

    failedJobs.push(job);
    failureMessages.push("Resend did not return an email delivery ID.");
  });

  return {
    completed: { jobs: completedJobs, ids: completedIds },
    failed: {
      jobs: failedJobs,
      reason: failureMessages.join("; ") || "Resend rejected the email batch.",
    },
  };
}

export async function processOutboxTick(
  deps: OutboxWorkerDependencies,
  options: { limit?: number } = {},
): Promise<ProcessOutboxSummary> {
  const claimed = await deps.claimJobs(options.limit ?? DEFAULT_CLAIM_LIMIT);
  if (claimed.length === 0) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      pausedForRateLimit: false,
      providerCalls: 0,
    };
  }

  const units = buildDispatchUnits(claimed);
  let sent = 0;
  let failed = 0;
  let providerCalls = 0;

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    providerCalls += 1;

    try {
      if (unit.kind === "single") {
        const result = await deps.sendEmail(unit.jobs[0], {
          idempotencyKey: unit.idempotencyKey,
        });
        if (!result?.id) {
          throw new Error("Resend did not return an email delivery ID.");
        }
        await deps.completeJobs(unit.jobs, [result.id]);
        sent += 1;
      } else {
        const result = await deps.sendEmailBatch(unit.jobs, {
          idempotencyKey: unit.idempotencyKey,
        });
        const outcome = mapBatchResult(unit.jobs, result);

        if (outcome.completed.jobs.length > 0) {
          await deps.completeJobs(
            outcome.completed.jobs,
            outcome.completed.ids,
          );
          sent += outcome.completed.jobs.length;
        }
        if (outcome.failed.jobs.length > 0) {
          await deps.rescheduleJobs(
            outcome.failed.jobs,
            outcome.failed.reason,
            RETRY_DELAY_SECONDS,
            false,
          );
          failed += outcome.failed.jobs.length;
        }
      }
    } catch (error) {
      const failure = classifyProviderFailure(error);

      if (failure.rateLimit) {
        const remaining = units
          .slice(index)
          .flatMap((pendingUnit) => pendingUnit.jobs);
        await deps.rescheduleJobs(
          remaining,
          `Resend rate limit paused dispatch: ${failure.message}`,
          rateLimitPauseSeconds(failure.rateLimit, deps.now()),
          true,
        );
        await deps.sleep(PACE_MS);
        return {
          claimed: claimed.length,
          sent,
          failed,
          pausedForRateLimit: true,
          providerCalls,
        };
      }

      await deps.rescheduleJobs(
        unit.jobs,
        failure.message,
        RETRY_DELAY_SECONDS,
        false,
      );
      failed += unit.jobs.length;
    }

    await deps.sleep(PACE_MS);
  }

  return {
    claimed: claimed.length,
    sent,
    failed,
    pausedForRateLimit: false,
    providerCalls,
  };
}
