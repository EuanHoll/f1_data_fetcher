import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const workerJobStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed"));

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
    const jobs = await ctx.db.query("workerJobs").order("desc").take(20);
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
