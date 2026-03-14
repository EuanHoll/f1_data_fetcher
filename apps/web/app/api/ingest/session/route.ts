import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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

  const provided = request.headers.get("x-ingest-key") ?? "";
  return provided === expected;
}

export async function POST(request: Request) {
  try {
    if (!validateIngestKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getConvexAdminClient();
    const body = (await request.json()) as Record<string, unknown>;
    const phase = String(body.phase ?? "");

    if (phase === "upsert_session") {
      const result = await client.mutation(api.ingest.upsertSessionContext, {
        year: Number(body.year),
        seasonName: body.seasonName ? String(body.seasonName) : undefined,
        round: Number(body.round),
        eventName: String(body.eventName),
        location: body.location ? String(body.location) : undefined,
        eventStartsAt: body.eventStartsAt ? Number(body.eventStartsAt) : undefined,
        sessionCode: String(body.sessionCode),
        sessionName: String(body.sessionName),
        sessionStartsAt: body.sessionStartsAt ? Number(body.sessionStartsAt) : undefined,
        source: String(body.source ?? "fastf1"),
        sourceRevision: body.sourceRevision ? String(body.sourceRevision) : undefined
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (phase === "push_laps") {
      const laps = Array.isArray(body.laps) ? body.laps : [];
      const result = await client.mutation(api.ingest.ingestLapsBatch, {
        sessionId: body.sessionId as any,
        laps: laps as any
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (phase === "finalize") {
      const result = await client.mutation(api.ingest.finalizeSessionIngestion, {
        ingestionRunId: body.ingestionRunId as any,
        sessionId: body.sessionId as any,
        success: Boolean(body.success),
        message: body.message ? String(body.message) : undefined
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown ingest phase" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
