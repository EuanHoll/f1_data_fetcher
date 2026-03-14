import { query } from "./_generated/server";

export const ping = query({
  args: {},
  handler: async () => {
    return {
      service: "convex",
      ok: true,
      now: Date.now()
    };
  }
});
