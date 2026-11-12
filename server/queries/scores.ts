import { desc } from "drizzle-orm";
import { getDb } from "./connection.js";
import { leaderboard } from "@db/schema";

export interface ScoreRow {
  name: string;
  score: number;
}

/** Top scores, highest first, latest submission wins ties. */
export async function topScores(limit = 50): Promise<ScoreRow[]> {
  const rows = await getDb()
    .select({ name: leaderboard.name, score: leaderboard.score })
    .from(leaderboard)
    .orderBy(desc(leaderboard.score), desc(leaderboard.createdAt))
    .limit(limit);
  return rows;
}

export async function insertScore(name: string, score: number): Promise<void> {
  await getDb().insert(leaderboard).values({ name, score });
}
