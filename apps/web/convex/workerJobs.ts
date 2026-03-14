import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function resolveSessionByRef(ctx: any, ref: { year: number; round: number; sessionCode: string }) {
  const season = await ctx.db
    .query("seasons")
    .withIndex("by_year", (q: any) => q.eq("year", ref.year))
    .first();
  if (!season) {
    return null;
  }

  const event = await ctx.db
    .query("events")
    .withIndex("by_season_round", (q: any) => q.eq("seasonId", season._id).eq("round", ref.round))
    .first();
  if (!event) {
    return null;
  }

  return await ctx.db
    .query("sessions")
    .withIndex("by_event_session_code", (q: any) => q.eq("eventId", event._id).eq("sessionCode", ref.sessionCode))
    .first();
}

const workerJobStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed"));
const queuedJobRecord = v.object({
  jobId: v.string(),
  createdAt: v.number(),
  total: v.number(),
  queuePosition: v.optional(v.number()),
  requestedSessionsJson: v.optional(v.string())
});

export const recordQueuedJob = mutation({
  args: {
    jobId: v.string(),
    createdAt: v.number(),
    total: v.number(),
    queuePosition: v.optional(v.number()),
    requestedSessionsJson: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workerJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();

    const payload = {
      jobId: args.jobId,
      status: "queued" as const,
      createdAt: args.createdAt,
      total: args.total,
      completed: 0,
      failed: 0,
      queuePosition: args.queuePosition,
      requestedSessionsJson: args.requestedSessionsJson
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("workerJobs", payload);
  }
});

export const recordQueuedJobs = mutation({
  args: {
    jobs: v.array(queuedJobRecord)
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const item of args.jobs) {
      const existing = await ctx.db
        .query("workerJobs")
        .withIndex("by_job_id", (q) => q.eq("jobId", item.jobId))
        .first();

      const payload = {
        jobId: item.jobId,
        status: "queued" as const,
        createdAt: item.createdAt,
        total: item.total,
        completed: 0,
        failed: 0,
        queuePosition: item.queuePosition,
        requestedSessionsJson: item.requestedSessionsJson
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        ids.push(existing._id);
      } else {
        ids.push(await ctx.db.insert("workerJobs", payload));
      }
    }

    return ids;
  }
});

export const upsertJobStatus = mutation({
  args: {
    jobId: v.string(),
    status: workerJobStatus,
    createdAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    total: v.number(),
    completed: v.number(),
    failed: v.number(),
    queuePosition: v.optional(v.number()),
    lastError: v.optional(v.string()),
    requestedSessionsJson: v.optional(v.string()),
    resultsJson: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workerJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();

    const payload = {
      jobId: args.jobId,
      status: args.status,
      createdAt: args.createdAt ?? existing?.createdAt ?? Date.now(),
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      total: args.total,
      completed: args.completed,
      failed: args.failed,
      queuePosition: args.queuePosition,
      lastError: args.lastError,
      requestedSessionsJson: args.requestedSessionsJson ?? existing?.requestedSessionsJson,
      resultsJson: args.resultsJson
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("workerJobs", payload);
  }
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("workerJobs").order("desc").take(50);
    return jobs.map((job) => ({
      id: job._id,
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      queuePosition: job.queuePosition ?? null,
      lastError: job.lastError ?? null,
      requestedSessions: job.requestedSessionsJson ? JSON.parse(job.requestedSessionsJson) : [],
      results: job.resultsJson ? JSON.parse(job.resultsJson) : []
    }));
  }
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("workerJobs").order("desc").take(50);
    return jobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => ({
        id: job._id,
        jobId: job.jobId,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? null,
        total: job.total,
        completed: job.completed,
        failed: job.failed,
        queuePosition: job.queuePosition ?? null,
        lastError: job.lastError ?? null,
        requestedSessionsJson: job.requestedSessionsJson
      }));
  }
});

export const reconcileMissingActiveJobs = mutation({
  args: {
    activeJobIds: v.array(v.string()),
    message: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db.query("workerJobs").collect();
    const activeSet = new Set(args.activeJobIds);
    const now = Date.now();
    let updated = 0;

    for (const job of jobs) {
      if (job.status !== "queued" && job.status !== "running") {
        continue;
      }
      if (activeSet.has(job.jobId)) {
        continue;
      }

      await ctx.db.patch(job._id, {
        status: "failed",
        completedAt: now,
        lastError: args.message ?? "Worker job no longer exists in the queue"
      });

      const requestedSessions = job.requestedSessionsJson ? JSON.parse(job.requestedSessionsJson) : [];
      const requestedSession = Array.isArray(requestedSessions) ? requestedSessions[0] : null;
      if (requestedSession) {
        const session = await resolveSessionByRef(ctx, requestedSession);
        if (session && session.activeJobId === job.jobId) {
          await ctx.db.patch(session._id, {
            queueStatus: "idle",
            activeJobId: undefined,
            lastCompletedAt: now,
            lastQueueError: args.message ?? "Worker job no longer exists in the queue"
          });
        }
      }
      updated += 1;
    }

    return { updated };
  }
});
