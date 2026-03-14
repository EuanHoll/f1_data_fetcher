import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const catalogSession = v.object({
  sessionCode: v.string(),
  sessionName: v.string(),
  startsAt: v.optional(v.number())
});

const catalogEvent = v.object({
  round: v.number(),
  name: v.string(),
  location: v.optional(v.string()),
  startsAt: v.optional(v.number()),
  sessions: v.array(catalogSession)
});

export const upsertCatalogYear = mutation({
  args: {
    year: v.number(),
    seasonName: v.optional(v.string()),
    source: v.string(),
    sourceRevision: v.optional(v.string()),
    events: v.array(catalogEvent)
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

    let eventsInserted = 0;
    let eventsUpdated = 0;
    let sessionsInserted = 0;
    let sessionsUpdated = 0;

    for (const eventInput of args.events) {
      const existingEvent = await ctx.db
        .query("events")
        .withIndex("by_season_round", (q) => q.eq("seasonId", seasonId).eq("round", eventInput.round))
        .first();

      const eventId =
        existingEvent?._id ??
        (await ctx.db.insert("events", {
          seasonId,
          round: eventInput.round,
          name: eventInput.name,
          location: eventInput.location,
          startsAt: eventInput.startsAt
        }));

      if (existingEvent) {
        await ctx.db.patch(existingEvent._id, {
          name: eventInput.name,
          location: eventInput.location,
          startsAt: eventInput.startsAt
        });
        eventsUpdated += 1;
      } else {
        eventsInserted += 1;
      }

      for (const sessionInput of eventInput.sessions) {
        const existingSession = await ctx.db
          .query("sessions")
          .withIndex("by_event_session_code", (q) => q.eq("eventId", eventId).eq("sessionCode", sessionInput.sessionCode))
          .first();

        if (existingSession) {
          await ctx.db.patch(existingSession._id, {
            sessionName: sessionInput.sessionName,
            startsAt: sessionInput.startsAt,
            source: args.source
          });
          sessionsUpdated += 1;
        } else {
          await ctx.db.insert("sessions", {
            eventId,
            sessionCode: sessionInput.sessionCode,
            sessionName: sessionInput.sessionName,
            startsAt: sessionInput.startsAt,
            ingestStatus: "pending",
            source: args.source
          });
          sessionsInserted += 1;
        }
      }
    }

    await ctx.db.insert("ingestionRuns", {
      source: args.source,
      sourceRevision: args.sourceRevision,
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      message: `Catalog sync ${args.year}: ${eventsInserted} events inserted, ${sessionsInserted} sessions inserted`
    });

    return {
      seasonId,
      eventsInserted,
      eventsUpdated,
      sessionsInserted,
      sessionsUpdated
    };
  }
});

export const getCoverage = query({
  args: {},
  handler: async (ctx) => {
    const seasons = await ctx.db.query("seasons").collect();
    const events = await ctx.db.query("events").collect();
    const sessions = await ctx.db.query("sessions").collect();
    const runs = await ctx.db.query("ingestionRuns").order("desc").take(8);

    const eventMap = new Map(events.map((event) => [event._id, event]));

    const rows = seasons
      .map((season) => {
        const seasonEvents = events.filter((event) => event.seasonId === season._id);
        const seasonEventIds = new Set(seasonEvents.map((event) => event._id));
        const seasonSessions = sessions.filter((session) => seasonEventIds.has(session.eventId));

        return {
          seasonYear: season.year,
          events: seasonEvents.length,
          sessions: seasonSessions.length,
          readySessions: seasonSessions.filter((session) => session.ingestStatus === "ready").length,
          lapRows: null
        };
      })
      .sort((a, b) => b.seasonYear - a.seasonYear);

    const recentRuns = runs.map((run) => {
      const details = run.message ?? "";
      return {
        id: run._id,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt ?? null,
        message: details
      };
    });

    const topPending = sessions
      .filter((session) => session.ingestStatus === "pending")
      .slice(0, 12)
      .map((session) => {
        const event = eventMap.get(session.eventId);
        return {
          sessionId: session._id,
          sessionCode: session.sessionCode,
          sessionName: session.sessionName,
          startsAt: session.startsAt ?? null,
          eventName: event?.name ?? "Unknown event"
        };
      });

    return {
      seasonRows: rows,
      recentRuns,
      topPending
    };
  }
});
