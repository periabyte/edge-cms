import { defineConfig } from "vitest/config";

/** Node-pool config: pure DDL golden tests + conformance gated on EDGECMS_MYSQL_URL. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
