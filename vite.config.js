import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: resolve("client"),
  server: {
    port: 5173,
    proxy: {
      "/api/realtime": {
        target: "ws://localhost:3000",
        ws: true,
        rewriteWsOrigin: true,
      },
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/audio": "http://localhost:3000",
    },
  },
  build: {
    outDir: resolve("public"),
    emptyOutDir: true,
  },
});
