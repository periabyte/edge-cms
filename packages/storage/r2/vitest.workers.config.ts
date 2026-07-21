import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/workers/**/*.test.ts"],
    poolOptions: {
      workers: { wrangler: { configPath: "./test/wrangler.test.jsonc" } },
    },
  },
});
