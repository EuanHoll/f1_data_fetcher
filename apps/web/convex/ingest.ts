import { v } from "convex/values";
import { mutation } from "./_generated/server";

const DRIVER_POOL_METRIC_KEY = "driver_pool";

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

const participantValidator = v.object({
  driverCode: v.string(),
  fullName: v.optional(v.string()),
  driverNumber: v.optional(v.number()),
  teamCode: v.optional(v.string()),
  teamName: v.optional(v.string()),
  teamColorHex: v.optional(v.string())
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

async function upsertSessionSummary(ctx: any, sessionId: any, metricKey: string, payload: unknown) {
  const existing = await ctx.db
    .query("sessionSummaries")
    .withIndex("by_session_metric", (q: any) => q.eq("sessionId", sessionId).eq("metricKey", metricKey))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      payloadJson: JSON.stringify(payload),
      updatedAt: Date.now()
    });
    return;
  }

  await ctx.db.insert("sessionSummaries", {
    sessionId,
    metricKey,
    payloadJson: JSON.stringify(payload),
    updatedAt: Date.now()
  });
}

async function getSessionDriverPool(ctx: any, sessionId: any) {
  const existing = await ctx.db
    .query("sessionSummaries")
    .withIndex("by_session_metric", (q: any) => q.eq("sessionId", sessionId).eq("metricKey", DRIVER_POOL_METRIC_KEY))
    .first();

  if (!existing) {
    return [] as Array<{ driverCode: string; lapCount: number; bestLapMs: number | null }>;
  }

  try {
    const parsed = JSON.parse(existing.payloadJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Array<{ driverCode: string; lapCount: number; bestLapMs: number | null }>;
  }
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

    await upsertSessionSummary(ctx, sessionId, DRIVER_POOL_METRIC_KEY, []);

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
    const batchSummary = new Map<string, { driverCode: string; lapCount: number; bestLapMs: number | null }>();

    for (const lap of args.laps) {
      const driverSummary = batchSummary.get(lap.driverCode) ?? {
        driverCode: lap.driverCode,
        lapCount: 0,
        bestLapMs: null
      };
      driverSummary.lapCount += 1;
      if (lap.lapTimeMs !== undefined) {
        driverSummary.bestLapMs = driverSummary.bestLapMs === null ? lap.lapTimeMs : Math.min(driverSummary.bestLapMs, lap.lapTimeMs);
      }
      batchSummary.set(lap.driverCode, driverSummary);

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

    const currentSummary = await getSessionDriverPool(ctx, args.sessionId);
    const mergedSummary = new Map(currentSummary.map((row) => [row.driverCode, row]));
    for (const row of batchSummary.values()) {
      const current = mergedSummary.get(row.driverCode) ?? {
        driverCode: row.driverCode,
        lapCount: 0,
        bestLapMs: null
      };
      current.lapCount += row.lapCount;
      current.bestLapMs =
        current.bestLapMs === null
          ? row.bestLapMs
          : row.bestLapMs === null
            ? current.bestLapMs
            : Math.min(current.bestLapMs, row.bestLapMs);
      mergedSummary.set(row.driverCode, current);
    }

    await upsertSessionSummary(
      ctx,
      args.sessionId,
      DRIVER_POOL_METRIC_KEY,
      Array.from(mergedSummary.values()).sort((a, b) => b.lapCount - a.lapCount || a.driverCode.localeCompare(b.driverCode))
    );

    return {
      inserted,
      updated,
      total: args.laps.length
    };
  }
});

export const upsertParticipantsBatch = mutation({
  args: {
    participants: v.array(participantValidator)
  },
  handler: async (ctx, args) => {
    let driverInserts = 0;
    let driverUpdates = 0;
    let teamInserts = 0;
    let teamUpdates = 0;

    for (const participant of args.participants) {
      const existingDriver = await ctx.db
        .query("drivers")
        .withIndex("by_code", (q) => q.eq("code", participant.driverCode))
        .first();

      if (existingDriver) {
        await ctx.db.patch(existingDriver._id, {
          fullName: participant.fullName ?? existingDriver.fullName,
          number: participant.driverNumber ?? existingDriver.number,
          teamName: participant.teamName ?? participant.teamCode ?? existingDriver.teamName
        });
        driverUpdates += 1;
      } else if (participant.fullName) {
        await ctx.db.insert("drivers", {
          code: participant.driverCode,
          fullName: participant.fullName,
          number: participant.driverNumber,
          teamName: participant.teamName ?? participant.teamCode
        });
        driverInserts += 1;
      }

      const resolvedTeamCode = participant.teamCode ?? participant.teamName;
      const resolvedTeamName = participant.teamName ?? participant.teamCode;
      if (!resolvedTeamCode || !resolvedTeamName) {
        continue;
      }

      const existingTeam = await ctx.db
        .query("teams")
        .withIndex("by_code", (q) => q.eq("code", resolvedTeamCode))
        .first();

      if (existingTeam) {
        await ctx.db.patch(existingTeam._id, {
          name: resolvedTeamName,
          colorHex: participant.teamColorHex ?? existingTeam.colorHex
        });
        teamUpdates += 1;
      } else {
        await ctx.db.insert("teams", {
          code: resolvedTeamCode,
          name: resolvedTeamName,
          colorHex: participant.teamColorHex
        });
        teamInserts += 1;
      }
    }

    return {
      driverInserts,
      driverUpdates,
      teamInserts,
      teamUpdates,
      total: args.participants.length
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
