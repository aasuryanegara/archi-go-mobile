/** Optional standalone Node server for local production-like testing. */
import { serve } from "@hono/node-server";
import app from "./app.js";
import { serveStaticFiles } from "./lib/vite.js";
import { log } from "./lib/logger.js";

serveStaticFiles(app);
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
serve({ fetch: app.fetch, port }, () => {
  log.info(`ARCHi Go server running on http://localhost:${port}/`);
});
