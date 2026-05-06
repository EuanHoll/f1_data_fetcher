import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

type UserRole = "admin" | "user";

type AuthProfile = {
  authSubject: string;
  displayName?: string | null;
  email?: string | null;
  role?: UserRole;
};

function getConvexAdminClient() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

  if (!url || !adminKey) {
    throw new Error("Convex self-hosted URL/admin key missing");
  }

  const client = new ConvexHttpClient(url);
  return { client, adminKey };
}

export async function syncIdentityToConvex(profile: AuthProfile) {
  const { client, adminKey } = getConvexAdminClient();

  (client as any).setAdminAuth(adminKey, {
    subject: profile.authSubject,
    issuer: "next-auth.local",
    name: profile.displayName ?? undefined,
    email: profile.email ?? undefined,
    role: profile.role ?? "user"
  });

  return await client.mutation(api.users.upsertFromAuthProfile, {
    authSubject: profile.authSubject,
    displayName: profile.displayName ?? undefined,
    email: profile.email ?? undefined,
    role: profile.role
  });
}
