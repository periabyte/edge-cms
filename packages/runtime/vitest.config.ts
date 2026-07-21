import { defineConfig } from "vitest/config";

/** Node-pool config for pure logic (query-param parsing, validation). */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/workers/**", "node_modules/**"],
  },
});
