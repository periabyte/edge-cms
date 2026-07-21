import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

/** Workers-pool config: exercises createApp() end-to-end via SELF.fetch. */
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
