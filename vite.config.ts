import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";

const root = import.meta.dirname;

export default defineConfig(({ command }) => ({
  plugins: [
    ...(command === "serve"
      ? [
          {
            name: "archigo-preview-host",
            config(config) {
              const hosts = config.server?.allowedHosts;
              if (hosts === true || hosts?.includes("3000.proxy.internal")) return;
              return { server: { allowedHosts: ["3000.proxy.internal"] } };
            },
          },
          devServer({
            entry: "server/boot.ts",
            exclude: [/^\/(?!api\/).*$/],
          }),
        ]
      : []),
    react(),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      "@contracts": path.resolve(root, "./contracts"),
      "@db": path.resolve(root, "./db"),
      db: path.resolve(root, "./db"),
    },
  },
  envDir: root,
  publicDir: path.resolve(root, "public-assets"),
  build: {
    outDir: path.resolve(root, "public"),
    emptyOutDir: true,
  },
}));
