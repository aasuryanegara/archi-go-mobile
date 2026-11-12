/**
 * backend.ts — online leaderboard client. One vanilla tRPC client at module scope
 * (game code under src/game/ is imperative and cannot use the React hooks from
 * src/providers/trpc.tsx). Calls fire only on discrete events (run end, menu open)
 * and results are cached — never per frame.
 */

import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/providers/trpc";
import type { CreateTRPCReact } from "@trpc/react-query";

// Read the router type off the React client the graft generated: game code never
// imports api/ and cannot drift from the real router.
type AppRouter = typeof trpc extends CreateTRPCReact<infer R, any> ? R : never;

export const backend = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (input, init) => globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }),
    }),
  ],
});

export interface LeaderboardEntry {
  name: string;
  score: number;
}

let cache: LeaderboardEntry[] | null = null;
let cacheFailed = false;

export async function fetchLeaderboard(force = false): Promise<LeaderboardEntry[] | null> {
  if (!force && (cache || cacheFailed)) return cacheFailed ? null : cache;
  try {
    const rows = await backend.leaderboard.top.query();
    cache = rows.map((r) => ({ name: r.name, score: r.score }));
    cacheFailed = false;
    return cache;
  } catch (e) {
    if (!(e instanceof TRPCClientError)) {
      console.warn("leaderboard fetch failed", e);
    }
    cacheFailed = true;
    return null;
  }
}

export async function submitScore(name: string, score: number): Promise<LeaderboardEntry[] | null> {
  try {
    const rows = await backend.leaderboard.submit.mutate({ name, score });
    cache = rows.map((r) => ({ name: r.name, score: r.score }));
    cacheFailed = false;
    return cache;
  } catch (e) {
    console.warn("leaderboard submit failed", e);
    cacheFailed = true;
    return null;
  }
}
