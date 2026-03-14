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

function validateIngestKey(request: Request) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    throw new Error("INGEST_API_KEY is not configured.");
  }

  return (request.headers.get("x-ingest-key") ?? "") === expected;
}

export async function POST(request: Request) {
  try {
    if (!validateIngestKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const client = getConvexAdminClient();
    const requestedSessions = body.requestedSessionsJson ? JSON.parse(String(body.requestedSessionsJson)) : [];
    const session = Array.isArray(requestedSessions) ? requestedSessions[0] : null;

    await client.mutation(api.workerJobs.upsertJobStatus, {
      jobId: String(body.jobId ?? ""),
      status: body.status as "queued" | "running" | "succeeded" | "failed",
      createdAt: typeof body.createdAt === "number" ? body.createdAt : undefined,
      startedAt: typeof body.startedAt === "number" ? body.startedAt : undefined,
      completedAt: typeof body.completedAt === "number" ? body.completedAt : undefined,
      total: Number(body.total ?? 0),
      completed: Number(body.completed ?? 0),
      failed: Number(body.failed ?? 0),
      queuePosition: typeof body.queuePosition === "number" ? body.queuePosition : undefined,
      lastError: body.lastError ? String(body.lastError) : undefined,
      requestedSessionsJson: body.requestedSessionsJson ? String(body.requestedSessionsJson) : undefined,
      resultsJson: body.resultsJson ? String(body.resultsJson) : undefined
    });

    if (session && typeof session === "object") {
      await client.mutation(api.sessions.updateQueueState, {
        session: {
          year: Number((session as any).year),
          round: Number((session as any).round),
          sessionCode: String((session as any).sessionCode ?? "")
        },
        jobId: String(body.jobId ?? ""),
        status: body.status as "queued" | "running" | "succeeded" | "failed",
        queuedAt: typeof body.createdAt === "number" ? body.createdAt : undefined,
        startedAt: typeof body.startedAt === "number" ? body.startedAt : undefined,
        completedAt: typeof body.completedAt === "number" ? body.completedAt : undefined,
        error: body.lastError ? String(body.lastError) : undefined
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker job update error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
