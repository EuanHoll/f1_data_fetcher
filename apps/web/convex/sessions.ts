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

const sessionRef = v.object({
  year: v.number(),
  round: v.number(),
  sessionCode: v.string()
});

export const markQueuedSessions = mutation({
  args: {
    items: v.array(
      v.object({
        jobId: v.string(),
        queuedAt: v.number(),
        queuePosition: v.optional(v.number()),
        session: sessionRef
      })
    )
  },
  handler: async (ctx, args) => {
    let updated = 0;
    for (const item of args.items) {
      const session = await resolveSessionByRef(ctx, item.session);
      if (!session) {
        continue;
      }
      await ctx.db.patch(session._id, {
        queueStatus: "queued",
        activeJobId: item.jobId,
        lastQueuedAt: item.queuedAt,
        lastQueueError: undefined
      });
      updated += 1;
    }
    return { updated };
  }
});

export const updateQueueState = mutation({
  args: {
    session: sessionRef,
    jobId: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    queuedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const session = await resolveSessionByRef(ctx, args.session);
    if (!session) {
      return { updated: false };
    }

    if (args.status === "queued") {
      await ctx.db.patch(session._id, {
        queueStatus: "queued",
        activeJobId: args.jobId,
        lastQueuedAt: args.queuedAt,
        lastQueueError: undefined
      });
      return { updated: true };
    }

    if (args.status === "running") {
      await ctx.db.patch(session._id, {
        queueStatus: "running",
        activeJobId: args.jobId,
        lastStartedAt: args.startedAt,
        lastQueueError: undefined
      });
      return { updated: true };
    }

    await ctx.db.patch(session._id, {
      queueStatus: "idle",
      activeJobId: undefined,
      lastCompletedAt: args.completedAt,
      lastQueueError: args.status === "failed" ? args.error : undefined
    });
    return { updated: true };
  }
});

export const reconcileMissingActiveJobs = mutation({
  args: {
    activeJobIds: v.array(v.string()),
    message: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db.query("sessions").collect();
    const activeSet = new Set(args.activeJobIds);
    const now = Date.now();
    let updated = 0;

    for (const session of sessions) {
      const queueStatus = session.queueStatus ?? "idle";
      if (queueStatus !== "queued" && queueStatus !== "running") {
        continue;
      }
      if (!session.activeJobId || activeSet.has(session.activeJobId)) {
        continue;
      }

      await ctx.db.patch(session._id, {
        queueStatus: "idle",
        activeJobId: undefined,
        lastCompletedAt: now,
        lastQueueError: args.message ?? "Worker job no longer exists in the queue"
      });
      updated += 1;
    }

    return { updated };
  }
});

export const getExplorerData = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    seasonYear: v.optional(v.number()),
    sessionCode: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))),
    order: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
    excludeFuture: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 120, 2000);
    const offset = Math.max(args.offset ?? 0, 0);
    const order = args.order ?? "newest";

    const sessions = await ctx.db.query("sessions").collect();
    const events = await ctx.db.query("events").collect();
    const seasonDocs = await ctx.db.query("seasons").collect();
    const eventMap = new Map(events.map((event) => [event._id, event]));
    const seasonMap = new Map(seasonDocs.map((season) => [season._id, season]));
    const runs = await ctx.db.query("ingestionRuns").order("desc").take(40);
    const lastRun = runs[0] ?? null;
    const now = Date.now();

    const allRows = await Promise.all(
      sessions.map(async (session) => {
        const event = eventMap.get(session.eventId) ?? null;
        const season = event ? seasonMap.get(event.seasonId) ?? null : null;

        return {
          id: session._id,
          sessionCode: session.sessionCode,
          sessionName: session.sessionName,
          ingestStatus: session.ingestStatus,
          queueStatus: session.queueStatus ?? "idle",
          activeJobId: session.activeJobId ?? null,
          lastQueuedAt: session.lastQueuedAt ?? null,
          lastStartedAt: session.lastStartedAt ?? null,
          lastCompletedAt: session.lastCompletedAt ?? null,
          lastQueueError: session.lastQueueError ?? null,
          startsAt: session.startsAt ?? null,
          lastFetchedAt: session.lastFetchedAt ?? null,
          cacheExpiresAt: session.cacheExpiresAt ?? null,
          source: session.source ?? null,
          eventName: event?.name ?? "Unknown Event",
          round: event?.round ?? null,
          seasonYear: season?.year ?? null,
          location: event?.location ?? null,
          lapCount: null
        };
      })
    );

    const seasonFacets = Array.from(new Set(allRows.map((row) => row.seasonYear).filter((year): year is number => year !== null))).sort((a, b) => b - a);
    const sessionCodes = Array.from(new Set(allRows.map((row) => row.sessionCode))).sort();

    const filtered = allRows.filter((row) => {
      const seasonOk = args.seasonYear === undefined || row.seasonYear === args.seasonYear;
      const sessionOk = args.sessionCode === undefined || row.sessionCode === args.sessionCode;
      const statusOk = args.status === undefined || row.ingestStatus === args.status;
      const futureOk = !args.excludeFuture || row.startsAt === null || row.startsAt <= now;
      return seasonOk && sessionOk && statusOk && futureOk;
    });

    filtered.sort((a, b) => {
      const left = a.startsAt ?? 0;
      const right = b.startsAt ?? 0;
      return order === "newest" ? right - left : left - right;
    });

    const pendingRows = filtered.filter((row) => row.ingestStatus === "pending");
    const pendingIdleRows = pendingRows.filter((row) => row.queueStatus === "idle");
    const upcomingPendingRows = pendingIdleRows.filter((row) => row.startsAt !== null && row.startsAt > now + 1000 * 60 * 30);
    const actionablePendingRows = pendingIdleRows.filter((row) => !(row.startsAt !== null && row.startsAt > now + 1000 * 60 * 30));
    const failedRows = filtered.filter((row) => row.ingestStatus === "failed");
    const pendingNeverAttempted = actionablePendingRows.filter((row) => row.lastFetchedAt === null).length;
    const pendingInProgressOrRetried = actionablePendingRows.length - pendingNeverAttempted;
    const pendingCacheExpired = actionablePendingRows.filter((row) => row.cacheExpiresAt !== null && row.cacheExpiresAt < now).length;

    const pendingPreview = [...actionablePendingRows]
      .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        seasonYear: row.seasonYear,
        round: row.round,
        eventName: row.eventName,
        sessionCode: row.sessionCode,
        sessionName: row.sessionName,
        startsAt: row.startsAt,
        source: row.source,
        lastFetchedAt: row.lastFetchedAt,
        cacheExpiresAt: row.cacheExpiresAt
      }));

    const rows = filtered.slice(offset, offset + limit);
    const pendingPageRows = actionablePendingRows.slice(offset, offset + limit);

    return {
      rows,
      source: allRows.length > 0 ? "database" : "sample",
      facets: {
        seasons: seasonFacets,
        sessionCodes
      },
      pagination: {
        total: filtered.length,
        offset,
        limit,
        hasNextPage: offset + limit < filtered.length,
        hasPrevPage: offset > 0
      },
      pendingPagination: {
        total: actionablePendingRows.length,
        offset,
        limit,
        hasNextPage: offset + limit < actionablePendingRows.length,
        hasPrevPage: offset > 0
      },
      pendingRows: pendingPageRows,
      stats: {
        totalSessions: filtered.length,
        readySessions: filtered.filter((r) => r.ingestStatus === "ready").length,
        pendingSessions: actionablePendingRows.length,
        upcomingSessions: upcomingPendingRows.length,
        queuedSessions: filtered.filter((r) => r.queueStatus === "queued").length,
        runningSessions: filtered.filter((r) => r.queueStatus === "running").length,
        failedSessions: failedRows.length,
        lastSyncAt: lastRun?.completedAt ?? null,
        ingestRunStatus: lastRun?.status ?? "none"
      },
      runDiagnostics: {
        runningCount: runs.filter((run) => run.status === "running").length,
        runningRuns: runs
          .filter((run) => run.status === "running")
          .slice(0, 12)
          .map((run) => ({
            id: run._id,
            source: run.source,
            startedAt: run.startedAt,
            message: run.message ?? null
          })),
        recentRuns: runs.slice(0, 20).map((run) => ({
          id: run._id,
          source: run.source,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt ?? null,
          message: run.message ?? null
        }))
      },
      pendingDiagnostics: {
        pendingNeverAttempted,
        pendingInProgressOrRetried,
        pendingCacheExpired,
        oldestPendingStartsAt: pendingPreview[0]?.startsAt ?? null,
        pendingPreview
      },
      sampleRows:
        rows.length > 0
          ? []
          : [
              {
                id: null,
                seasonYear: 2025,
                round: 2,
                eventName: "Saudi Arabian Grand Prix",
                location: "Jeddah",
                sessionCode: "R",
                sessionName: "Race",
                ingestStatus: "pending",
                startsAt: null,
                lapCount: null
              },
              {
                id: null,
                seasonYear: 2025,
                round: 2,
                eventName: "Saudi Arabian Grand Prix",
                location: "Jeddah",
                sessionCode: "Q",
                sessionName: "Qualifying",
                ingestStatus: "pending",
                startsAt: null,
                lapCount: null
              }
            ]
    };
  }
});

export const getSessionLapStory = query({
  args: {
    sessionId: v.id("sessions"),
    limitRows: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const laps = await ctx.db.query("laps").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect();

    const validLaps = laps
      .filter((lap) => lap.lapTimeMs !== undefined)
      .sort((a, b) => {
        if (a.driverCode === b.driverCode) {
          return a.lapNumber - b.lapNumber;
        }
        return a.driverCode.localeCompare(b.driverCode);
      });

    const byDriver = new Map<
      string,
      {
        driverCode: string;
        points: Array<{ lapNumber: number; lapTimeMs: number }>;
      }
    >();

    for (const lap of validLaps) {
      const lapTimeMs = lap.lapTimeMs;
      if (lapTimeMs === undefined) {
        continue;
      }

      if (!byDriver.has(lap.driverCode)) {
        byDriver.set(lap.driverCode, {
          driverCode: lap.driverCode,
          points: []
        });
      }

      byDriver.get(lap.driverCode)?.points.push({
        lapNumber: lap.lapNumber,
        lapTimeMs
      });
    }

    const series = Array.from(byDriver.values()).sort((a, b) => b.points.length - a.points.length);
    const topSeries = series.slice(0, 2);

    const lapTimes = validLaps.map((lap) => lap.lapTimeMs as number);
    const bestLapMs = lapTimes.length ? Math.min(...lapTimes) : null;
    const avgLapMs = lapTimes.length ? Math.round(lapTimes.reduce((acc, value) => acc + value, 0) / lapTimes.length) : null;

    const topRows = [...validLaps]
      .sort((a, b) => (a.lapTimeMs as number) - (b.lapTimeMs as number))
      .slice(0, Math.min(args.limitRows ?? 20, 100))
      .map((lap) => ({
        driverCode: lap.driverCode,
        lapNumber: lap.lapNumber,
        lapTimeMs: lap.lapTimeMs as number,
        compound: lap.compound ?? null,
        stint: lap.stint ?? null,
        deltaToBestMs: bestLapMs !== null ? (lap.lapTimeMs as number) - bestLapMs : null
      }));

    return {
      sessionId: args.sessionId,
      totalLaps: validLaps.length,
      bestLapMs,
      avgLapMs,
      series: topSeries,
      topRows
    };
  }
});

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
}

function stdDev(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

export const getSessionDrivers = query({
  args: {
    sessionId: v.id("sessions")
  },
  handler: async (ctx, args) => {
    const laps = await ctx.db.query("laps").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect();

    const byDriver = new Map<string, { driverCode: string; lapCount: number; bestLapMs: number | null }>();

    for (const lap of laps) {
      const current = byDriver.get(lap.driverCode) ?? {
        driverCode: lap.driverCode,
        lapCount: 0,
        bestLapMs: null
      };

      current.lapCount += 1;
      if (lap.lapTimeMs !== undefined) {
        current.bestLapMs = current.bestLapMs === null ? lap.lapTimeMs : Math.min(current.bestLapMs, lap.lapTimeMs);
      }

      byDriver.set(lap.driverCode, current);
    }

    return Array.from(byDriver.values()).sort((a, b) => b.lapCount - a.lapCount || a.driverCode.localeCompare(b.driverCode));
  }
});

export const getSessionComparison = query({
  args: {
    sessionId: v.id("sessions"),
    driverA: v.string(),
    driverB: v.string(),
    maxPoints: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const maxPoints = Math.min(args.maxPoints ?? 120, 400);
    const lapsA = await ctx.db.query("laps").withIndex("by_session_driver", (q) => q.eq("sessionId", args.sessionId).eq("driverCode", args.driverA)).collect();
    const lapsB = await ctx.db.query("laps").withIndex("by_session_driver", (q) => q.eq("sessionId", args.sessionId).eq("driverCode", args.driverB)).collect();

    const validA = lapsA.filter((lap) => lap.lapTimeMs !== undefined);
    const validB = lapsB.filter((lap) => lap.lapTimeMs !== undefined);

    const aByLap = new Map(validA.map((lap) => [lap.lapNumber, lap]));
    const bByLap = new Map(validB.map((lap) => [lap.lapNumber, lap]));
    const lapNumbers = Array.from(new Set([...aByLap.keys(), ...bByLap.keys()])).sort((a, b) => a - b);

    const points = lapNumbers
      .map((lapNumber) => {
        const a = aByLap.get(lapNumber);
        const b = bByLap.get(lapNumber);
        const aMs = a?.lapTimeMs ?? null;
        const bMs = b?.lapTimeMs ?? null;
        return {
          lapNumber,
          aLapTimeMs: aMs,
          bLapTimeMs: bMs,
          deltaMs: aMs !== null && bMs !== null ? aMs - bMs : null,
          aCompound: a?.compound ?? null,
          bCompound: b?.compound ?? null,
          aStint: a?.stint ?? null,
          bStint: b?.stint ?? null
        };
      })
      .slice(0, maxPoints);

    const validDeltas = points.map((point) => point.deltaMs).filter((value): value is number => value !== null);
    const aTimes = validA.map((lap) => lap.lapTimeMs as number);
    const bTimes = validB.map((lap) => lap.lapTimeMs as number);

    return {
      driverA: args.driverA,
      driverB: args.driverB,
      points,
      stats: {
        aBestMs: aTimes.length > 0 ? Math.min(...aTimes) : null,
        bBestMs: bTimes.length > 0 ? Math.min(...bTimes) : null,
        aMedianMs: median(aTimes),
        bMedianMs: median(bTimes),
        aStdDevMs: stdDev(aTimes),
        bStdDevMs: stdDev(bTimes),
        medianDeltaMs: median(validDeltas),
        avgDeltaMs: validDeltas.length > 0 ? Math.round(validDeltas.reduce((acc, value) => acc + value, 0) / validDeltas.length) : null,
        comparedLaps: validDeltas.length
      }
    };
  }
});

export const getCompareDriverPool = query({
  args: {
    sessionIds: v.array(v.id("sessions"))
  },
  handler: async (ctx, args) => {
    const uniqueSessionIds = Array.from(new Set(args.sessionIds)).slice(0, 24);
    const driverDocs = await ctx.db.query("drivers").collect();
    const driverMeta = new Map(driverDocs.map((driver) => [driver.code, driver]));
    const rows = new Map<string, { driverCode: string; sessionCount: number; totalLaps: number; bestLapMs: number | null }>();

    for (const sessionId of uniqueSessionIds) {
      const summary = await ctx.db
        .query("sessionSummaries")
        .withIndex("by_session_metric", (q: any) => q.eq("sessionId", sessionId).eq("metricKey", "driver_pool"))
        .first();

      let summaryRows = summary ? (JSON.parse(summary.payloadJson) as Array<{ driverCode: string; lapCount: number; bestLapMs: number | null }>) : [];

      if (summaryRows.length === 0) {
        const laps = await ctx.db.query("laps").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
        const fallback = new Map<string, { driverCode: string; lapCount: number; bestLapMs: number | null }>();

        for (const lap of laps) {
          const current = fallback.get(lap.driverCode) ?? {
            driverCode: lap.driverCode,
            lapCount: 0,
            bestLapMs: null
          };

          current.lapCount += 1;
          if (lap.lapTimeMs !== undefined) {
            current.bestLapMs = current.bestLapMs === null ? lap.lapTimeMs : Math.min(current.bestLapMs, lap.lapTimeMs);
          }

          fallback.set(lap.driverCode, current);
        }

        summaryRows = Array.from(fallback.values());
      }

      for (const driver of summaryRows) {
        const row = rows.get(driver.driverCode) ?? {
          driverCode: driver.driverCode,
          sessionCount: 0,
          totalLaps: 0,
          bestLapMs: null
        };

        row.sessionCount += 1;
        row.totalLaps += driver.lapCount;
        row.bestLapMs = row.bestLapMs === null ? driver.bestLapMs : driver.bestLapMs === null ? row.bestLapMs : Math.min(row.bestLapMs, driver.bestLapMs);

        rows.set(driver.driverCode, row);
      }
    }

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        driverName: driverMeta.get(row.driverCode)?.fullName ?? null,
        teamName: driverMeta.get(row.driverCode)?.teamName ?? null
      }))
      .sort((a, b) => {
        if (b.sessionCount !== a.sessionCount) {
          return b.sessionCount - a.sessionCount;
        }
        if (b.totalLaps !== a.totalLaps) {
          return b.totalLaps - a.totalLaps;
        }
        return a.driverCode.localeCompare(b.driverCode);
      });
  }
});

export const getMultiSessionComparison = query({
  args: {
    sessionIds: v.array(v.id("sessions")),
    driverCodes: v.array(v.string()),
    maxPoints: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const uniqueSessionIds = Array.from(new Set(args.sessionIds)).slice(0, 12);
    const uniqueDriverCodes = Array.from(new Set(args.driverCodes.map((driverCode) => driverCode.trim().toUpperCase()).filter(Boolean)));
    const maxPoints = Math.min(args.maxPoints ?? 80, 160);
    const driverDocs = await ctx.db.query("drivers").collect();
    const driverMeta = new Map(driverDocs.map((driver) => [driver.code, driver]));

    if (uniqueSessionIds.length === 0 || uniqueDriverCodes.length === 0) {
      return {
        sessions: [],
        summaries: [],
        aggregates: [],
        series: []
      };
    }

    const sessionDocs = await Promise.all(uniqueSessionIds.map((sessionId) => ctx.db.get(sessionId)));
    const validSessionDocs = sessionDocs.filter((session): session is NonNullable<typeof session> => session !== null);
    const eventDocs = await Promise.all(validSessionDocs.map((session) => ctx.db.get(session.eventId)));
    const seasonDocs = await Promise.all(
      eventDocs.map((event) => (event ? ctx.db.get(event.seasonId) : Promise.resolve(null)))
    );

    const sessionMeta = validSessionDocs
      .map((session, index) => {
        const event = eventDocs[index];
        const season = seasonDocs[index];
        return {
          id: session._id,
          sessionCode: session.sessionCode,
          sessionName: session.sessionName,
          startsAt: session.startsAt ?? null,
          eventName: event?.name ?? "Unknown Event",
          location: event?.location ?? null,
          round: event?.round ?? null,
          seasonYear: season?.year ?? null
        };
      })
      .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));

    const summaries: Array<{
      key: string;
      sessionId: string;
      sessionLabel: string;
      driverCode: string;
      driverName: string | null;
      teamName: string | null;
      eventName: string;
      location: string | null;
      seasonYear: number | null;
      round: number | null;
      sessionCode: string;
      lapCount: number;
      bestLapMs: number | null;
      medianLapMs: number | null;
      averageLapMs: number | null;
      stdDevMs: number | null;
      deltaToSessionBestMs: number | null;
    }> = [];
    const series: Array<{
      key: string;
      sessionId: string;
      sessionBestLapMs: number | null;
      driverCode: string;
      driverName: string | null;
      teamName: string | null;
      sessionLabel: string;
      eventName: string;
      location: string | null;
      seasonYear: number | null;
      round: number | null;
      sessionCode: string;
      points: Array<{ lapNumber: number; lapTimeMs: number; progressRatio: number }>;
    }> = [];

    for (const session of sessionMeta) {
      const sessionBestByAnyDriver = await ctx.db.query("laps").withIndex("by_session", (q) => q.eq("sessionId", session.id as any)).collect();
      const sessionBestLapMs = sessionBestByAnyDriver
        .map((lap) => lap.lapTimeMs)
        .filter((value): value is number => value !== undefined)
        .reduce<number | null>((best, value) => (best === null ? value : Math.min(best, value)), null);

      for (const driverCode of uniqueDriverCodes) {
        const driverLaps = await ctx.db
          .query("laps")
          .withIndex("by_session_driver", (q) => q.eq("sessionId", session.id as any).eq("driverCode", driverCode))
          .collect();

        const validLaps = driverLaps
          .filter((lap) => lap.lapTimeMs !== undefined)
          .sort((a, b) => a.lapNumber - b.lapNumber);

        if (validLaps.length === 0) {
          continue;
        }

        const lapTimes = validLaps.map((lap) => lap.lapTimeMs as number);
        const sampled = validLaps.slice(0, maxPoints);
        const denominator = Math.max(sampled.length - 1, 1);
        const sessionLabel = `${session.seasonYear ?? "-"} ${session.sessionCode} ${session.eventName}`;
        const key = `${session.id}-${driverCode}`;
        const bestLapMs = Math.min(...lapTimes);
        const driver = driverMeta.get(driverCode);

        summaries.push({
          key,
          sessionId: String(session.id),
          sessionLabel,
          driverCode,
          driverName: driver?.fullName ?? null,
          teamName: driver?.teamName ?? null,
          eventName: session.eventName,
          location: session.location,
          seasonYear: session.seasonYear,
          round: session.round,
          sessionCode: session.sessionCode,
          lapCount: validLaps.length,
          bestLapMs,
          medianLapMs: median(lapTimes),
          averageLapMs: average(lapTimes),
          stdDevMs: stdDev(lapTimes),
          deltaToSessionBestMs: sessionBestLapMs === null ? null : bestLapMs - sessionBestLapMs
        });

        series.push({
          key,
          sessionId: String(session.id),
          sessionBestLapMs,
          driverCode,
          driverName: driver?.fullName ?? null,
          teamName: driver?.teamName ?? null,
          sessionLabel,
          eventName: session.eventName,
          location: session.location,
          seasonYear: session.seasonYear,
          round: session.round,
          sessionCode: session.sessionCode,
          points: sampled.map((lap, index) => ({
            lapNumber: lap.lapNumber,
            lapTimeMs: lap.lapTimeMs as number,
            progressRatio: sampled.length === 1 ? 1 : index / denominator
          }))
        });
      }
    }

    const aggregates = uniqueDriverCodes
      .map((driverCode) => {
        const rows = summaries.filter((summary) => summary.driverCode === driverCode);
        if (rows.length === 0) {
          return null;
        }

        const bestLaps = rows.map((row) => row.bestLapMs).filter((value): value is number => value !== null);
        const medians = rows.map((row) => row.medianLapMs).filter((value): value is number => value !== null);
        const deltas = rows.map((row) => row.deltaToSessionBestMs).filter((value): value is number => value !== null);

        return {
          driverCode,
          driverName: rows.find((row) => row.driverName)?.driverName ?? null,
          teamName: rows.find((row) => row.teamName)?.teamName ?? null,
          sessionCount: rows.length,
          totalLaps: rows.reduce((acc, row) => acc + row.lapCount, 0),
          bestLapMs: bestLaps.length > 0 ? Math.min(...bestLaps) : null,
          medianOfMediansMs: median(medians),
          averageDeltaToSessionBestMs: average(deltas)
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        const left = a.medianOfMediansMs ?? Number.MAX_SAFE_INTEGER;
        const right = b.medianOfMediansMs ?? Number.MAX_SAFE_INTEGER;
        if (left !== right) {
          return left - right;
        }
        return a.driverCode.localeCompare(b.driverCode);
      });

    return {
      sessions: sessionMeta,
      summaries,
      aggregates,
      series
    };
  }
});

export const getReadySessionsForCompare = query({
  args: {
    seasonYears: v.optional(v.array(v.number())),
    sessionCode: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 1200, 2500);
    const readySessions = await ctx.db.query("sessions").withIndex("by_ingest_status", (q) => q.eq("ingestStatus", "ready")).collect();
    const events = await ctx.db.query("events").collect();
    const seasons = await ctx.db.query("seasons").collect();

    const eventMap = new Map(events.map((event) => [event._id, event]));
    const seasonMap = new Map(seasons.map((season) => [season._id, season]));

    const rows = await Promise.all(
      readySessions.map(async (session) => {
        const event = eventMap.get(session.eventId) ?? null;
        const season = event ? seasonMap.get(event.seasonId) ?? null : null;
        const firstLap = await ctx.db.query("laps").withIndex("by_session", (q) => q.eq("sessionId", session._id)).take(1);

        return {
          id: session._id,
          sessionCode: session.sessionCode,
          sessionName: session.sessionName,
          startsAt: session.startsAt ?? null,
          eventName: event?.name ?? "Unknown Event",
          location: event?.location ?? null,
          round: event?.round ?? null,
          seasonYear: season?.year ?? null,
          hasLaps: firstLap.length > 0
        };
      })
    );

    const filtered = rows
      .filter((row) => (args.seasonYears === undefined || args.seasonYears.length === 0 ? true : args.seasonYears.includes(row.seasonYear ?? -1)))
      .filter((row) => (args.sessionCode === undefined ? true : row.sessionCode === args.sessionCode))
      .filter((row) => row.hasLaps)
      .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0))
      .slice(0, limit);

    const seasonFacets = Array.from(new Set(rows.map((row) => row.seasonYear).filter((year): year is number => year !== null))).sort((a, b) => b - a);
    const sessionCodeFacets = Array.from(new Set(rows.map((row) => row.sessionCode))).sort();

    return {
      rows: filtered,
      facets: {
        seasons: seasonFacets,
        sessionCodes: sessionCodeFacets
      },
      totalReadyWithLaps: filtered.length
    };
  }
});

export const seedSampleWeekend = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    let season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", 2025))
      .first();

    const seasonId =
      season?._id ??
      (await ctx.db.insert("seasons", {
        year: 2025,
        name: "2025 Formula 1 World Championship"
      }));

    if (!season) {
      season = await ctx.db.get(seasonId);
    }

    let event = await ctx.db
      .query("events")
      .withIndex("by_season_round", (q) => q.eq("seasonId", seasonId).eq("round", 2))
      .first();

    const eventId =
      event?._id ??
      (await ctx.db.insert("events", {
        seasonId,
        round: 2,
        name: "Saudi Arabian Grand Prix",
        location: "Jeddah",
        startsAt: now
      }));

    if (!event) {
      event = await ctx.db.get(eventId);
    }

    const sessionsToEnsure = [
      { code: "FP2", name: "Practice 2" },
      { code: "Q", name: "Qualifying" },
      { code: "R", name: "Race" }
    ];

    let created = 0;

    for (const sessionInfo of sessionsToEnsure) {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_event_session_code", (q) => q.eq("eventId", eventId).eq("sessionCode", sessionInfo.code))
        .first();

      if (!existing) {
        await ctx.db.insert("sessions", {
          eventId,
          sessionCode: sessionInfo.code,
          sessionName: sessionInfo.name,
          startsAt: now,
          ingestStatus: "ready",
          source: "sample-seed",
          lastFetchedAt: now,
          cacheExpiresAt: now + 1000 * 60 * 60 * 24 * 30
        });
        created += 1;
      }
    }

    await ctx.db.insert("ingestionRuns", {
      source: "sample-seed",
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      message: `Seeded Saudi weekend, created ${created} sessions`
    });

    return {
      ok: true,
      created,
      seasonId,
      eventId
    };
  }
});
