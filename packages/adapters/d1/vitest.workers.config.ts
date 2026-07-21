import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/** Workers-pool config: real D1 binding via miniflare. */
export default defineWorkersConfig({
  test: {
    include: ["test/workers/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./test/wrangler.test.jsonc" },
      },
    },
  },
});
