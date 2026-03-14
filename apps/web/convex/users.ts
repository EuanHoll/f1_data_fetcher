import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .first();

    return (
      user ?? {
        authSubject: identity.subject,
        role: "user",
        displayName: identity.name ?? null,
        email: identity.email ?? null
      }
    );
  }
});

export const upsertFromIdentity = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: identity.name,
        email: identity.email,
        updatedAt: now
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      authSubject: identity.subject,
      email: identity.email,
      displayName: identity.name,
      role: "user",
      createdAt: now,
      updatedAt: now
    });
  }
});

export const upsertFromAuthProfile = mutation({
  args: {
    authSubject: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        displayName: args.displayName,
        updatedAt: now
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      authSubject: args.authSubject,
      email: args.email,
      displayName: args.displayName,
      role: "user",
      createdAt: now,
      updatedAt: now
    });
  }
});
