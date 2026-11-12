import { z } from "zod";
import { createRouter, publicQuery } from "./middleware.js";
import { insertScore, topScores } from "./queries/scores.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  leaderboard: createRouter({
    top: publicQuery.query(async () => topScores(50)),
    submit: publicQuery
      .input(z.object({
        name: z.string().trim().min(1).max(14),
        score: z.number().int().min(0).max(10_000_000),
      }))
      .mutation(async ({ input }) => {
        await insertScore(input.name, input.score);
        return topScores(50);
      }),
  }),
});

export type AppRouter = typeof appRouter;
