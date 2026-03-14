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

export async function GET() {
  try {
    const client = getConvexAdminClient();
    const status = await client.query(api.catalog.getBootstrapStatus, {});
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap status error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
