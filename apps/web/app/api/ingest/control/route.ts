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

function getWorkerContext(request: Request) {
  const requestUrl = new URL(request.url);
  const workerUrl = process.env.INGEST_WORKER_URL ?? "http://127.0.0.1:8080";
  const baseUrl = process.env.INGEST_BASE_URL ?? requestUrl.origin;
  const apiKey = process.env.INGEST_API_KEY;
  const workerApiKey = process.env.WORKER_API_KEY;

  if (!apiKey) {
    throw new Error("INGEST_API_KEY is not configured.");
  }

  return {
    workerUrl,
    baseUrl,
    apiKey,
    workerApiKey
  };
}

async function enqueueOnWorker(
  workerUrl: string,
  workerApiKey: string | undefined,
  payload: {
    baseUrl: string;
    ingestApiKey: string;
    sessions: Array<{ year: number; round: number; sessionCode: string }>;
  }
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

function normalizeSessions(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as Array<{ year: number; round: number; sessionCode: string }>;
  }

  const unique = new Map<string, { year: number; round: number; sessionCode: string }>();
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const year = Number((item as any).year);
    const round = Number((item as any).round);
    const sessionCode = String((item as any).sessionCode ?? "").toUpperCase();
    if (!Number.isFinite(year) || !Number.isFinite(round) || !sessionCode) {
      continue;
    }
    unique.set(`${year}-${round}-${sessionCode}`, { year, round, sessionCode });
  }

  return [...unique.values()];
}

async function getFilteredPendingSessions(
  client: ConvexHttpClient,
  seasonYear: number | undefined,
  sessionCode: string | undefined
) {
  const rows: Array<{ year: number; round: number; sessionCode: string }> = [];
  let offset = 0;
  const step = 1000;

  while (true) {
    const result = await client.query(api.sessions.getExplorerData, {
      limit: step,
      offset,
      seasonYear,
      sessionCode,
      order: "oldest"
    });

    for (const row of result.rows) {
      if (row.ingestStatus !== "pending") {
        continue;
      }
      if (row.seasonYear === null || row.round === null) {
        continue;
      }
      rows.push({
        year: row.seasonYear,
        round: row.round,
        sessionCode: row.sessionCode
      });
    }

    if (!result.pagination.hasNextPage) {
      break;
    }
    offset += step;
  }

  return normalizeSessions(rows);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const context = getWorkerContext(request);

    if (action === "ingest_session") {
      const year = Number(body.year);
      const round = Number(body.round);
      const sessionCode = String(body.sessionCode ?? "").toUpperCase();

      if (!Number.isFinite(year) || !Number.isFinite(round) || !sessionCode) {
        return NextResponse.json({ error: "Invalid session payload" }, { status: 400 });
      }

      const workerResult = await enqueueOnWorker(context.workerUrl, context.workerApiKey, {
        baseUrl: context.baseUrl,
        ingestApiKey: context.apiKey,
        sessions: [{ year, round, sessionCode }]
      });

      return NextResponse.json({ ok: true, queued: 1, ...workerResult });
    }

    if (action === "ingest_batch" || action === "ingest_filtered_pending") {
      const client = getConvexAdminClient();

      const sessions =
        action === "ingest_batch"
          ? normalizeSessions(body.sessions)
          : await getFilteredPendingSessions(
              client,
              body.seasonYear === undefined ? undefined : Number(body.seasonYear),
              body.sessionCode ? String(body.sessionCode).toUpperCase() : undefined
            );

      if (sessions.length === 0) {
        return NextResponse.json({ ok: true, queued: 0, message: "No matching pending sessions." });
      }

      const workerResult = await enqueueOnWorker(context.workerUrl, context.workerApiKey, {
        baseUrl: context.baseUrl,
        ingestApiKey: context.apiKey,
        sessions
      });

      return NextResponse.json({ ok: true, queued: sessions.length, ...workerResult });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest control error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
