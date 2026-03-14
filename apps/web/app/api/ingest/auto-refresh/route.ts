import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

function getConvexAdminClient() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!url || !adminKey) {
    throw new Error("Convex self-hosted environment is not configured.");
  }
  const client = new ConvexHttpClient(url);
  (client as any).setAdminAuth(adminKey);
  return client;
}

function requireIngestKey(request: Request) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    throw new Error("INGEST_API_KEY is not configured.");
  }
  if ((request.headers.get("x-ingest-key") ?? "") !== expected) {
    throw new Error("Unauthorized");
  }
}

function getWorkerContext(request: Request) {
  const requestUrl = new URL(request.url);
  const workerUrl = process.env.INGEST_WORKER_URL ?? "http://127.0.0.1:8080";
  const baseUrl = process.env.INGEST_BASE_URL ?? requestUrl.origin;
  const apiKey = process.env.INGEST_API_KEY;
  const workerApiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    throw new Error("INGEST_API_KEY is not configured.");
  }
  return { workerUrl, baseUrl, apiKey, workerApiKey };
}

async function enqueueOnWorker(
  workerUrl: string,
  workerApiKey: string | undefined,
  payload: { baseUrl: string; ingestApiKey: string; sessions: Array<{ year: number; round: number; sessionCode: string }> }
) {
  const response = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(workerApiKey ? { "x-worker-key": workerApiKey } : {})
    },
    body: JSON.stringify(payload)
  });

  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(result.error ?? result.detail ?? "Failed to enqueue ingest job"));
  }
  return result;
}

async function enqueueSessions(
  client: ConvexHttpClient,
  context: ReturnType<typeof getWorkerContext>,
  sessions: Array<{ year: number; round: number; sessionCode: string }>
) {
  const queuedAt = Date.now();
  const queued = [] as Array<{
    jobId: string;
    createdAt: number;
    total: number;
    queuePosition?: number;
    requestedSessionsJson: string;
    session: { year: number; round: number; sessionCode: string };
  }>;

  for (const session of sessions) {
    const workerResult = await enqueueOnWorker(context.workerUrl, context.workerApiKey, {
      baseUrl: context.baseUrl,
      ingestApiKey: context.apiKey,
      sessions: [session]
    });
    if (!workerResult.jobId) {
      continue;
    }
    queued.push({
      jobId: String(workerResult.jobId),
      createdAt: queuedAt,
      total: 1,
      queuePosition: typeof workerResult.queueSize === "number" ? Number(workerResult.queueSize) : undefined,
      requestedSessionsJson: JSON.stringify([session]),
      session
    });
  }

  if (queued.length > 0) {
    await client.mutation(api.workerJobs.recordQueuedJobs, {
      jobs: queued.map(({ session, ...job }) => job)
    });
    await client.mutation(api.sessions.markQueuedSessions, {
      items: queued.map((item) => ({
        jobId: item.jobId,
        queuedAt,
        queuePosition: item.queuePosition,
        session: item.session
      }))
    });
  }

  return queued;
}

export async function POST(request: Request) {
  try {
    requireIngestKey(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const liveLimit = Math.max(0, Number(body.liveLimit ?? process.env.AUTO_REFRESH_LIVE_LIMIT ?? 6));
    const historicalLimit = Math.max(0, Number(body.historicalLimit ?? process.env.AUTO_REFRESH_HISTORICAL_LIMIT ?? 12));

    const client = getConvexAdminClient();
    const context = getWorkerContext(request);

    const [liveCandidates, historicalCandidates] = await Promise.all([
      client.query(api.ingestion.listSessionsNeedingRefresh, { mode: "live", limit: liveLimit }),
      client.query(api.ingestion.listSessionsNeedingRefresh, { mode: "historical", limit: historicalLimit })
    ]);

    const liveQueued = await enqueueSessions(
      client,
      context,
      liveCandidates.map((item) => ({ year: item.year, round: item.round, sessionCode: item.sessionCode }))
    );
    const historicalQueued = await enqueueSessions(
      client,
      context,
      historicalCandidates.map((item) => ({ year: item.year, round: item.round, sessionCode: item.sessionCode }))
    );

    return NextResponse.json({
      ok: true,
      liveCandidates: liveCandidates.length,
      historicalCandidates: historicalCandidates.length,
      queued: liveQueued.length + historicalQueued.length,
      liveQueued: liveQueued.length,
      historicalQueued: historicalQueued.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auto-refresh error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
