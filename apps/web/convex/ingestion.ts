import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function computeCachePolicy(startsAt: number | null) {
  const now = Date.now();
  if (!startsAt) {
    return {
      mode: "historical",
      ttlMs: 1000 * 60 * 60 * 24 * 30,
      shouldBypassCache: false
    };
  }

  const liveWindowMs = 1000 * 60 * 60 * 6;
  const isLiveWindow = Math.abs(now - startsAt) < liveWindowMs;

  return {
    mode: isLiveWindow ? "live" : "historical",
    ttlMs: isLiveWindow ? 1000 * 60 * 5 : 1000 * 60 * 60 * 24 * 30,
    shouldBypassCache: isLiveWindow
  };
}

export const getSessionRefreshPolicy = query({
  args: {
    sessionId: v.id("sessions")
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const policy = computeCachePolicy(session.startsAt ?? null);
    const now = Date.now();
    const cacheExpired = !session.cacheExpiresAt || session.cacheExpiresAt <= now;

    return {
      sessionId: session._id,
      mode: policy.mode,
      shouldFetch: policy.shouldBypassCache || cacheExpired,
      cacheExpired,
      ttlMs: policy.ttlMs,
      cacheExpiresAt: session.cacheExpiresAt ?? null,
      lastFetchedAt: session.lastFetchedAt ?? null
    };
  }
});

export const markSessionRefreshed = mutation({
  args: {
    sessionId: v.id("sessions"),
    source: v.string(),
    force: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const policy = computeCachePolicy(session.startsAt ?? null);
    const now = Date.now();
    const cacheExpired = !session.cacheExpiresAt || session.cacheExpiresAt <= now;
    const shouldFetch = Boolean(args.force) || policy.shouldBypassCache || cacheExpired;

    if (!shouldFetch) {
      return {
        refreshed: false,
        reason: "cache_valid",
        cacheExpiresAt: session.cacheExpiresAt ?? null
      };
    }

    const cacheExpiresAt = now + policy.ttlMs;

    await ctx.db.patch(session._id, {
      ingestStatus: "ready",
      source: args.source,
      lastFetchedAt: now,
      cacheExpiresAt
    });

    await ctx.db.insert("ingestionRuns", {
      source: args.source,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      message: `Refreshed session ${session.sessionCode} (${policy.mode})`
    });

    return {
      refreshed: true,
      mode: policy.mode,
      cacheExpiresAt,
      shouldFetch
    };
  }
});
