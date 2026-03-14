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
    const activeJobIds = Array.isArray(body.activeJobIds)
      ? body.activeJobIds.map((jobId) => String(jobId)).filter(Boolean)
      : [];

    const client = getConvexAdminClient();
    const result = await client.mutation(api.workerJobs.reconcileMissingActiveJobs, {
      activeJobIds,
      message: body.message ? String(body.message) : undefined
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker job reconciliation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
