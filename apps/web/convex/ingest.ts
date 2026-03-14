import { v } from "convex/values";
import { mutation } from "./_generated/server";

const lapValidator = v.object({
  driverCode: v.string(),
  teamCode: v.optional(v.string()),
  lapNumber: v.number(),
  lapTimeMs: v.optional(v.number()),
  sector1Ms: v.optional(v.number()),
  sector2Ms: v.optional(v.number()),
  sector3Ms: v.optional(v.number()),
  compound: v.optional(v.string()),
  stint: v.optional(v.number()),
  isPitInLap: v.optional(v.boolean()),
  isPitOutLap: v.optional(v.boolean())
});

function computeTtlMs(startsAt: number | undefined) {
  if (!startsAt) {
    return 1000 * 60 * 60 * 24 * 7;
  }
  const now = Date.now();
  const liveWindowMs = 1000 * 60 * 60 * 12;
  const isLiveWindow = Math.abs(now - startsAt) < liveWindowMs;
  return isLiveWindow ? 1000 * 60 * 2 : 1000 * 60 * 60 * 24 * 7;
}

export const upsertSessionContext = mutation({
  args: {
    year: v.number(),
    seasonName: v.optional(v.string()),
    round: v.number(),
    eventName: v.string(),
    location: v.optional(v.string()),
    eventStartsAt: v.optional(v.number()),
    sessionCode: v.string(),
    sessionName: v.string(),
    sessionStartsAt: v.optional(v.number()),
    source: v.string(),
    sourceRevision: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    const seasonId =
      existingSeason?._id ??
      (await ctx.db.insert("seasons", {
        year: args.year,
        name: args.seasonName ?? `${args.year} Formula 1 World Championship`
      }));

    const existingEvent = await ctx.db
      .query("events")
      .withIndex("by_season_round", (q) => q.eq("seasonId", seasonId).eq("round", args.round))
      .first();

    const eventId =
      existingEvent?._id ??
      (await ctx.db.insert("events", {
        seasonId,
        round: args.round,
        name: args.eventName,
        location: args.location,
        startsAt: args.eventStartsAt
      }));

    if (existingEvent) {
      await ctx.db.patch(existingEvent._id, {
        name: args.eventName,
        location: args.location,
        startsAt: args.eventStartsAt
      });
    }

    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_event_session_code", (q) => q.eq("eventId", eventId).eq("sessionCode", args.sessionCode))
      .first();

    const sessionId =
      existingSession?._id ??
      (await ctx.db.insert("sessions", {
        eventId,
        sessionCode: args.sessionCode,
        sessionName: args.sessionName,
        startsAt: args.sessionStartsAt,
        ingestStatus: "pending",
        queueStatus: "running",
        source: args.source,
        lastFetchedAt: now,
        cacheExpiresAt: now + computeTtlMs(args.sessionStartsAt)
      }));

    if (existingSession) {
      await ctx.db.patch(existingSession._id, {
        sessionName: args.sessionName,
        startsAt: args.sessionStartsAt,
        ingestStatus: "pending",
        queueStatus: "running",
        source: args.source,
        lastFetchedAt: now,
        cacheExpiresAt: now + computeTtlMs(args.sessionStartsAt)
      });
    }

    const ingestionRunId = await ctx.db.insert("ingestionRuns", {
      source: args.source,
      sourceRevision: args.sourceRevision,
      status: "running",
      startedAt: now,
      message: `Ingesting ${args.year} R${args.round} ${args.sessionCode}`
    });

    return {
      seasonId,
      eventId,
      sessionId,
      ingestionRunId
    };
  }
});

export const ingestLapsBatch = mutation({
  args: {
    sessionId: v.id("sessions"),
    laps: v.array(lapValidator)
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const lap of args.laps) {
      const existing = await ctx.db
        .query("laps")
        .withIndex("by_session_driver_lap", (q) =>
          q.eq("sessionId", args.sessionId).eq("driverCode", lap.driverCode).eq("lapNumber", lap.lapNumber)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          teamCode: lap.teamCode,
          lapTimeMs: lap.lapTimeMs,
          sector1Ms: lap.sector1Ms,
          sector2Ms: lap.sector2Ms,
          sector3Ms: lap.sector3Ms,
          compound: lap.compound,
          stint: lap.stint,
          isPitInLap: lap.isPitInLap,
          isPitOutLap: lap.isPitOutLap
        });
        updated += 1;
      } else {
        await ctx.db.insert("laps", {
          sessionId: args.sessionId,
          driverCode: lap.driverCode,
          teamCode: lap.teamCode,
          lapNumber: lap.lapNumber,
          lapTimeMs: lap.lapTimeMs,
          sector1Ms: lap.sector1Ms,
          sector2Ms: lap.sector2Ms,
          sector3Ms: lap.sector3Ms,
          compound: lap.compound,
          stint: lap.stint,
          isPitInLap: lap.isPitInLap,
          isPitOutLap: lap.isPitOutLap
        });
        inserted += 1;
      }
    }

    return {
      inserted,
      updated,
      total: args.laps.length
    };
  }
});

export const finalizeSessionIngestion = mutation({
  args: {
    ingestionRunId: v.id("ingestionRuns"),
    sessionId: v.id("sessions"),
    success: v.boolean(),
    message: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const ttlMs = computeTtlMs(session.startsAt);

    await ctx.db.patch(args.sessionId, {
      ingestStatus: args.success ? "ready" : "failed",
      queueStatus: "idle",
      activeJobId: undefined,
      lastCompletedAt: now,
      lastQueueError: args.success ? undefined : args.message,
      lastFetchedAt: now,
      cacheExpiresAt: now + ttlMs
    });

    await ctx.db.patch(args.ingestionRunId, {
      status: args.success ? "succeeded" : "failed",
      completedAt: now,
      message: args.message
    });

    return {
      ok: true,
      cacheExpiresAt: now + ttlMs,
      mode: ttlMs < 1000 * 60 * 60 ? "live" : "historical"
    };
  }
});
