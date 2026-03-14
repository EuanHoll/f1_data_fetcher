import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function getCurrentUserId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .first();

  if (!user) {
    throw new Error("No user record found. Run users.upsertFromIdentity first.");
  }

  return user._id;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("savedViews")
      .withIndex("by_owner_updated_at", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(50);
  }
});

export const getPublicById = query({
  args: {
    id: v.id("savedViews")
  },
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.id);
    if (!view) {
      return null;
    }
    if (view.isPublic) {
      return view;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .first();

    if (!user || user._id !== view.ownerId) {
      return null;
    }

    return view;
  }
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    configJson: v.string()
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    const now = Date.now();

    return await ctx.db.insert("savedViews", {
      ownerId: userId,
      title: args.title,
      description: args.description,
      isPublic: args.isPublic,
      configJson: args.configJson,
      createdAt: now,
      updatedAt: now
    });
  }
});
