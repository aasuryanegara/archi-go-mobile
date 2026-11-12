import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  int,
  // bigint,
} from "drizzle-orm/mysql-core";

// TODO: Add your tables here. See docs/Database.md for schema examples and patterns.
//
// Example:
// export const posts = mysqlTable("posts", {
//   id: serial("id").primaryKey(),
//   title: varchar("title", { length: 255 }).notNull(),
//   content: text("content"),
//   createdAt: timestamp("created_at").notNull().defaultNow(),
// });
//
// Note: FK columns referencing a serial() PK must use:
//   bigint("columnName", { mode: "number", unsigned: true }).notNull()

/** Online leaderboard: one row per submitted run. */
export const leaderboard = mysqlTable("leaderboard", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 14 }).notNull(),
  score: int("score").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
