import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/outbox-worker.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const worker = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const NOW = new Date("2026-10-26T10:00:00.000Z");

function makeJob(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    idempotencyKey: `trigger:job:${index}`,
    recipientEmail: `member${index}@example.org`,
    recipientName: `Member ${index}`,
    subject: `Subject ${index}`,
    heading: `Heading ${index}`,
    bodyText: `Body ${index}`,
    ctaLabel: null,
    ctaUrl: null,
    batchGroupKey: null,
    templatePayload: {},
    ...overrides,
  };
}

function createDependencies(jobs, options = {}) {
  const calls = {
    claimedWith: null,
    batched: [],
    single: [],
    completed: [],
    rescheduled: [],
    sleeps: [],
  };

  let singleIndex = 0;
  const deps = {
    now: () => options.now ?? NOW,
    claimJobs: async (limit) => {
      calls.claimedWith = limit;
      return jobs;
    },
    sendEmail: async (job, requestOptions) => {
      calls.single.push({ job, requestOptions });
      if (options.sendSingle) {
        return options.sendSingle(job, requestOptions, singleIndex++);
      }
      return { id: `single-${job.id}` };
    },
    sendEmailBatch: async (batchJobs, requestOptions) => {
      calls.batched.push({ jobs: batchJobs, requestOptions });
      if (options.sendBatch) {
        return options.sendBatch(batchJobs, requestOptions);
      }
      return { data: batchJobs.map((job) => ({ id: `batch-${job.id}` })) };
    },
    completeJobs: async (completedJobs, providerIds) => {
      calls.completed.push({ jobs: completedJobs, providerIds });
    },
    rescheduleJobs: async (rescheduledJobs, reason, delaySeconds, paused) => {
      calls.rescheduled.push({
        jobs: rescheduledJobs,
        reason,
        delaySeconds,
        paused,
      });
    },
    sleep: async (ms) => {
      calls.sleeps.push(ms);
    },
  };

  return { deps, calls };
}

describe("outbox worker batching policy", () => {
  it("chunks jobs into batches of at most 100", () => {
    const jobs = Array.from({ length: 250 }, (_, index) => makeJob(index));
    const chunks = worker.chunkJobs(jobs);
    assert.deepEqual(
      chunks.map((chunk) => chunk.length),
      [100, 100, 50],
    );
    assert.equal(worker.MAX_BATCH_SIZE, 100);
    assert.equal(worker.PACE_MS, 600);
  });

  it("builds order-independent deterministic batch idempotency keys", () => {
    const keys = ["event_published:event:a:recipient:1", "event_published:event:a:recipient:2"];
    const forward = worker.buildBatchIdempotencyKey(keys);
    const reverse = worker.buildBatchIdempotencyKey([...keys].reverse());

    assert.equal(forward, reverse);
    assert.match(forward, /^[a-z0-9][a-z0-9:_-]{0,254}$/);
    assert.ok(forward.length <= 255);
    assert.notEqual(forward, worker.buildBatchIdempotencyKey([keys[0]]));
  });

  it("classifies per-second and quota rate limits", () => {
    assert.equal(
      worker.classifyProviderFailure({
        statusCode: 429,
        name: "daily_quota_exceeded",
        message: "daily quota exceeded",
      }).rateLimit,
      "daily_quota",
    );
    assert.equal(
      worker.classifyProviderFailure({
        statusCode: 429,
        name: "monthly_quota_exceeded",
        message: "monthly quota exceeded",
      }).rateLimit,
      "monthly_quota",
    );
    assert.equal(
      worker.classifyProviderFailure({
        statusCode: 429,
        name: "rate_limit_exceeded",
        message: "Too many requests",
      }).rateLimit,
      "per_second",
    );
    assert.equal(
      worker.classifyProviderFailure({ statusCode: 429 }).rateLimit,
      "per_second",
    );
    assert.equal(
      worker.classifyProviderFailure({ statusCode: 500, message: "boom" })
        .rateLimit,
      null,
    );
    assert.equal(
      worker.classifyProviderFailure(new Error("network down")).rateLimit,
      null,
    );
  });

  it("pauses one minute for per-second limits and until 00:05 UTC for quota limits", () => {
    assert.equal(worker.rateLimitPauseSeconds("per_second", NOW), 60);
    const daily = worker.rateLimitPauseSeconds("daily_quota", NOW);
    const resumeAt = new Date(NOW.getTime() + daily * 1000);
    assert.equal(resumeAt.toISOString(), "2026-10-27T00:05:00.000Z");
  });
});

describe("outbox worker tick", () => {
  it("groups a broadcast into one batch call with a shared idempotency key", async () => {
    const jobs = [
      makeJob(1, { batchGroupKey: "event_published:event:42" }),
      makeJob(2, { batchGroupKey: "event_published:event:42" }),
    ];
    const { deps, calls } = createDependencies(jobs);

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.claimedWith, 200);
    assert.equal(calls.batched.length, 1);
    assert.equal(calls.batched[0].jobs.length, 2);
    assert.match(
      calls.batched[0].requestOptions.idempotencyKey,
      /^[a-z0-9][a-z0-9:_-]{0,254}$/,
    );
    assert.deepEqual(calls.completed[0].providerIds, [
      "batch-00000000-0000-4000-8000-000000000001",
      "batch-00000000-0000-4000-8000-000000000002",
    ]);
    assert.deepEqual(calls.sleeps, [600]);
    assert.equal(summary.sent, 2);
    assert.equal(summary.providerCalls, 1);
    assert.equal(summary.pausedForRateLimit, false);
  });

  it("sends transactional jobs individually with their row idempotency key", async () => {
    const jobs = [makeJob(1), makeJob(2)];
    const { deps, calls } = createDependencies(jobs);

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.single.length, 2);
    assert.equal(
      calls.single[0].requestOptions.idempotencyKey,
      "trigger:job:1",
    );
    assert.equal(
      calls.single[1].requestOptions.idempotencyKey,
      "trigger:job:2",
    );
    assert.equal(calls.completed.length, 2);
    assert.deepEqual(calls.sleeps, [600, 600]);
    assert.equal(summary.sent, 2);
    assert.equal(summary.providerCalls, 2);
  });

  it("pauses the current and remaining jobs on quota 429 without losing any", async () => {
    const jobs = [makeJob(1), makeJob(2), makeJob(3)];
    const { deps, calls } = createDependencies(jobs, {
      sendSingle: (_job, _options, index) => {
        if (index === 1) {
          const error = new Error("daily quota exceeded");
          error.statusCode = 429;
          error.name = "daily_quota_exceeded";
          throw error;
        }
        return { id: `single-${index}` };
      },
    });

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.single.length, 2);
    assert.equal(calls.rescheduled.length, 1);
    assert.equal(calls.rescheduled[0].paused, true);
    assert.equal(calls.rescheduled[0].delaySeconds, 50700);
    assert.deepEqual(
      calls.rescheduled[0].jobs.map((job) => job.id),
      jobs.slice(1).map((job) => job.id),
    );
    assert.equal(calls.completed.length, 1);
    assert.equal(summary.pausedForRateLimit, true);
    assert.equal(summary.sent, 1);
    assert.equal(summary.providerCalls, 2);
  });

  it("retries a transient failure and keeps processing later jobs", async () => {
    const jobs = [makeJob(1), makeJob(2)];
    const { deps, calls } = createDependencies(jobs, {
      sendSingle: (_job, _options, index) => {
        if (index === 0) {
          const error = new Error("provider unavailable");
          error.statusCode = 503;
          throw error;
        }
        return { id: "single-ok" };
      },
    });

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.single.length, 2);
    assert.equal(calls.rescheduled.length, 1);
    assert.equal(calls.rescheduled[0].paused, false);
    assert.equal(calls.rescheduled[0].delaySeconds, 60);
    assert.equal(calls.rescheduled[0].jobs[0].id, jobs[0].id);
    assert.equal(calls.completed.length, 1);
    assert.equal(calls.completed[0].jobs[0].id, jobs[1].id);
    assert.equal(summary.failed, 1);
    assert.equal(summary.sent, 1);
    assert.equal(summary.pausedForRateLimit, false);
  });

  it("completes successful batch members and retries only permissive errors", async () => {
    const jobs = [
      makeJob(1, { batchGroupKey: "ann:9" }),
      makeJob(2, { batchGroupKey: "ann:9" }),
      makeJob(3, { batchGroupKey: "ann:9" }),
    ];
    const { deps, calls } = createDependencies(jobs, {
      sendBatch: () => ({
        data: [{ id: "provider-1" }, { id: "provider-3" }],
        errors: [{ index: 1, message: "invalid recipient" }],
      }),
    });

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.completed.length, 1);
    assert.deepEqual(
      calls.completed[0].jobs.map((job) => job.id),
      [jobs[0].id, jobs[2].id],
    );
    assert.deepEqual(calls.completed[0].providerIds, ["provider-1", "provider-3"]);
    assert.equal(calls.rescheduled.length, 1);
    assert.deepEqual(
      calls.rescheduled[0].jobs.map((job) => job.id),
      [jobs[1].id],
    );
    assert.match(calls.rescheduled[0].reason, /invalid recipient/);
    assert.equal(summary.sent, 2);
    assert.equal(summary.failed, 1);
  });

  it("does nothing when the queue is empty", async () => {
    const { deps, calls } = createDependencies([]);

    const summary = await worker.processOutboxTick(deps);

    assert.equal(calls.batched.length, 0);
    assert.equal(calls.single.length, 0);
    assert.equal(calls.completed.length, 0);
    assert.equal(calls.rescheduled.length, 0);
    assert.equal(calls.sleeps.length, 0);
    assert.deepEqual(summary, {
      claimed: 0,
      sent: 0,
      failed: 0,
      pausedForRateLimit: false,
      providerCalls: 0,
    });
  });
});
