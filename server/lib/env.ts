import "dotenv/config";

/** Read database configuration only when a database-backed route is used.
 * This lets the API boot and its health endpoint work before a DB is provisioned.
 */
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
};
