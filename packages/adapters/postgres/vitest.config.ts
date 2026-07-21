import { defineConfig } from "vitest/config";

/** Node-pool config: pure DDL golden tests + conformance gated on EDGECMS_PG_URL. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
