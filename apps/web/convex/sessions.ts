import { query } from "./_generated/server";

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").take(25);

    if (sessions.length > 0) {
      return sessions;
    }

    return [
      {
        _id: "demo-session-1",
        _creationTime: Date.now(),
        eventId: "demo-event-1",
        sessionCode: "R",
        sessionName: "Race",
        startsAt: Date.now(),
        ingestStatus: "pending"
      }
    ];
  }
});
