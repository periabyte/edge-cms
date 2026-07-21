import { defineConfig } from "vitest/config";

/** Node-pool config for pure logic (DDL emitter, node:sqlite apply tests). */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/workers/**", "node_modules/**"],
  },
});
