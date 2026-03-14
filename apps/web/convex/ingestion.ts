import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function computeCachePolicy(startsAt: number | null) {
  const now = Date.now();
  const livePrefetchMs = 1000 * 60 * 30;
  if (!startsAt) {
    return {
      mode: "historical",
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      shouldBypassCache: false
    };
  }

  const liveLookbackMs = 1000 * 60 * 60 * 12;
  const isLiveWindow = startsAt <= now + livePrefetchMs && startsAt >= now - liveLookbackMs;

  return {
    mode: isLiveWindow ? "live" : "historical",
    ttlMs: isLiveWindow ? 1000 * 60 * 2 : 1000 * 60 * 60 * 24 * 7,
    shouldBypassCache: false
  };
}

export const listSessionsNeedingRefresh = query({
  args: {
    mode: v.union(v.literal("live"), v.literal("historical")),
    limit: v.number()
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db.query("sessions").collect();
    const events = await ctx.db.query("events").collect();
    const seasons = await ctx.db.query("seasons").collect();
    const eventMap = new Map(events.map((event) => [event._id, event]));
    const seasonMap = new Map(seasons.map((season) => [season._id, season]));
    const now = Date.now();
    const livePrefetchMs = 1000 * 60 * 30;

    return sessions
      .filter((session) => (session.queueStatus ?? "idle") === "idle")
      .map((session) => {
        const event = eventMap.get(session.eventId) ?? null;
        const season = event ? seasonMap.get(event.seasonId) ?? null : null;
        const policy = computeCachePolicy(session.startsAt ?? null);
        const due = !session.lastFetchedAt || !session.cacheExpiresAt || session.cacheExpiresAt <= now;
        const hasStartedOrIsNear = !session.startsAt || session.startsAt <= now + livePrefetchMs;
        const canAutoRefresh = policy.mode === "live" ? hasStartedOrIsNear : session.lastFetchedAt !== null && session.ingestStatus === "ready";

        return {
          year: season?.year ?? null,
          round: event?.round ?? null,
          sessionCode: session.sessionCode,
          sessionName: session.sessionName,
          startsAt: session.startsAt ?? null,
          lastFetchedAt: session.lastFetchedAt ?? null,
          cacheExpiresAt: session.cacheExpiresAt ?? null,
          mode: policy.mode,
          due,
          canAutoRefresh
        };
      })
      .filter((session) => session.mode === args.mode && session.due && session.canAutoRefresh && session.year !== null && session.round !== null)
      .sort((a, b) => {
        const leftDueAt = a.cacheExpiresAt ?? 0;
        const rightDueAt = b.cacheExpiresAt ?? 0;
        if (leftDueAt !== rightDueAt) {
          return leftDueAt - rightDueAt;
        }
        return (a.startsAt ?? 0) - (b.startsAt ?? 0);
      })
      .slice(0, Math.max(0, args.limit))
      .map((session) => ({
        year: session.year as number,
        round: session.round as number,
        sessionCode: session.sessionCode,
        sessionName: session.sessionName,
        startsAt: session.startsAt,
        lastFetchedAt: session.lastFetchedAt,
        cacheExpiresAt: session.cacheExpiresAt,
        mode: session.mode
      }));
  }
});

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
