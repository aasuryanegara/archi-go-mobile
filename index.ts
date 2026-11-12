/** Vercel Hono entrypoint. Static Vite assets are emitted to public/. */
import { Hono } from "hono";
import app from "./server/app.js";

// Keep the original application instance so its middleware and error handler
// are preserved when Vercel invokes the root Hono entrypoint.
if (!(app instanceof Hono)) {
  throw new TypeError("ARCHi Go API entrypoint must export a Hono application.");
}

export default app;
