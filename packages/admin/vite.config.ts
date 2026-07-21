import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin SPA is served from /admin (via the router basename) by Workers Assets
// in production. `base` MUST be "/" so the built asset URLs are root-absolute
// (/assets/*.js): Workers Assets serves the dist at the namespace root and the
// SPA-fallback returns index.html for /admin*, so /admin/assets/* would 404.
// Dev proxies /admin/api and /media to a local `wrangler dev`.
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/admin/api": "http://localhost:8787",
      "/media": "http://localhost:8787",
    },
  },
});
