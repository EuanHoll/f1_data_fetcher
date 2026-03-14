import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { syncIdentityToConvex } from "@/lib/convex-admin";
import { resolveViewerRole } from "@/lib/authz";

const providers = [] as any[];

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET
    })
  );
}

providers.push(
  Credentials({
    name: "Local Dev Login",
    credentials: {
      name: { label: "Name", type: "text" }
    },
    authorize: async (credentials) => {
      const rawName = String(credentials?.name ?? "").trim();
      if (!rawName) {
        return null;
      }

      const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const id = `dev:${slug || "user"}`;

      return {
        id,
        name: rawName,
        email: `${slug || "user"}@local.dev`
      };
    }
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async signIn({ user }) {
      if (!user?.id) {
        return false;
      }

      try {
        const role = resolveViewerRole({
          id: user.id,
          email: user.email
        });

        await syncIdentityToConvex({
          authSubject: user.id,
          displayName: user.name,
          email: user.email,
          role
        });
      } catch (error) {
        console.error("Failed to sync identity into Convex", error);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.role = resolveViewerRole({
          id: user.id,
          email: user.email
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
        (session.user as { role?: "admin" | "user" }).role = (token.role as "admin" | "user" | undefined) ?? "user";
      }
      return session;
    }
  }
});
