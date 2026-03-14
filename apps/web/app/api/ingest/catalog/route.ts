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

    const body = (await request.json()) as Record<string, unknown>;
    const client = getConvexAdminClient();

    const result = await client.mutation(api.catalog.upsertCatalogYear, {
      year: Number(body.year),
      seasonName: body.seasonName ? String(body.seasonName) : undefined,
      source: String(body.source ?? "fastf1-catalog"),
      sourceRevision: body.sourceRevision ? String(body.sourceRevision) : undefined,
      events: (Array.isArray(body.events) ? body.events : []) as any
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown catalog ingest error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
