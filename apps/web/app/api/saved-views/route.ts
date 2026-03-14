import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { api } from "@/convex/_generated/api";
import { resolveViewerRole } from "@/lib/authz";

function getConvexClient() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

  if (!url || !adminKey) {
    throw new Error("Convex self-hosted URL/admin key missing");
  }

  const client = new ConvexHttpClient(url);
  return { client, adminKey };
}

function actingIdentity(session: Session | null) {
  const subject = session?.user?.id ?? session?.user?.email ?? "anonymous";
  return {
    subject,
    issuer: "next-auth.local",
    name: session?.user?.name ?? undefined,
    email: session?.user?.email ?? undefined,
    role: resolveViewerRole({
      id: session?.user?.id,
      email: session?.user?.email
    })
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ authenticated: false, items: [] });
  }

  const { client, adminKey } = getConvexClient();
  (client as any).setAdminAuth(adminKey, actingIdentity(session));

  await client.mutation(api.users.upsertFromAuthProfile, {
    authSubject: session.user.id ?? session.user.email ?? "anonymous",
    displayName: session.user.name ?? undefined,
    email: session.user.email ?? undefined,
    role: resolveViewerRole({
      id: session.user.id,
      email: session.user.email
    })
  });

  const items = await client.query(api.savedViews.listMine, {});
  return NextResponse.json({ authenticated: true, items });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { title?: string; description?: string; isPublic?: boolean };
  const title = (body.title ?? "Untitled saved view").trim();

  const { client, adminKey } = getConvexClient();
  (client as any).setAdminAuth(adminKey, actingIdentity(session));

  await client.mutation(api.users.upsertFromAuthProfile, {
    authSubject: session.user.id ?? session.user.email ?? "anonymous",
    displayName: session.user.name ?? undefined,
    email: session.user.email ?? undefined,
    role: resolveViewerRole({
      id: session.user.id,
      email: session.user.email
    })
  });

  const id = await client.mutation(api.savedViews.create, {
    title,
    description: body.description,
    isPublic: body.isPublic ?? false,
    configJson: JSON.stringify({ source: "session_explorer", createdFrom: "web" })
  });

  return NextResponse.json({ ok: true, id });
}
