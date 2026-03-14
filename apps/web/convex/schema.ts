import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    authSubject: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("analyst"), v.literal("user")),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_auth_subject", ["authSubject"]),

  seasons: defineTable({
    year: v.number(),
    name: v.string()
  }).index("by_year", ["year"]),

  events: defineTable({
    seasonId: v.id("seasons"),
    round: v.number(),
    name: v.string(),
    location: v.optional(v.string()),
    startsAt: v.optional(v.number())
  })
    .index("by_season_round", ["seasonId", "round"])
    .index("by_season", ["seasonId"]),

  sessions: defineTable({
    eventId: v.id("events"),
    sessionCode: v.string(),
    sessionName: v.string(),
    startsAt: v.optional(v.number()),
    ingestStatus: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    lastFetchedAt: v.optional(v.number()),
    cacheExpiresAt: v.optional(v.number()),
    source: v.optional(v.string())
  })
    .index("by_event", ["eventId"])
    .index("by_ingest_status", ["ingestStatus"])
    .index("by_event_session_code", ["eventId", "sessionCode"]),

  drivers: defineTable({
    code: v.string(),
    fullName: v.string(),
    number: v.optional(v.number()),
    teamName: v.optional(v.string())
  }).index("by_code", ["code"]),

  teams: defineTable({
    code: v.string(),
    name: v.string(),
    colorHex: v.optional(v.string())
  }).index("by_code", ["code"]),

  laps: defineTable({
    sessionId: v.id("sessions"),
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
  })
    .index("by_session", ["sessionId"])
    .index("by_session_driver", ["sessionId", "driverCode"])
    .index("by_session_driver_lap", ["sessionId", "driverCode", "lapNumber"])
    .index("by_session_team", ["sessionId", "teamCode"])
    .index("by_session_stint", ["sessionId", "stint"]),

  sessionSummaries: defineTable({
    sessionId: v.id("sessions"),
    metricKey: v.string(),
    payloadJson: v.string(),
    updatedAt: v.number()
  })
    .index("by_session", ["sessionId"])
    .index("by_session_metric", ["sessionId", "metricKey"]),

  savedViews: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    configJson: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated_at", ["ownerId", "updatedAt"]),

  favorites: defineTable({
    userId: v.id("users"),
    entityType: v.union(v.literal("driver"), v.literal("team"), v.literal("event")),
    entityKey: v.string(),
    createdAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_entity", ["userId", "entityType", "entityKey"]),

  ingestionRuns: defineTable({
    source: v.string(),
    sourceRevision: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    message: v.optional(v.string())
  }).index("by_started_at", ["startedAt"]),

  workerJobs: defineTable({
    jobId: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    total: v.number(),
    completed: v.number(),
    failed: v.number(),
    queuePosition: v.optional(v.number()),
    lastError: v.optional(v.string()),
    requestedSessionsJson: v.optional(v.string()),
    resultsJson: v.optional(v.string())
  })
    .index("by_job_id", ["jobId"])
    .index("by_created_at", ["createdAt"])
});
