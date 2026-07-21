import { describe, expect, it, vi } from "vitest";
import { CfClient } from "../../src/cf/client.js";
import { uploadWorkerScript } from "../../src/cf/workers.js";

const creds = { apiToken: "tok", accountId: "acct" };

/** Reads the JSON `metadata` part out of the multipart upload body. */
async function metadataFrom(init: RequestInit | undefined): Promise<Record<string, unknown>> {
  const form = init!.body as FormData;
  const blob = form.get("metadata") as Blob;
  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

describe("uploadWorkerScript", () => {
  it("sets keep_secrets so redeploys don't wipe SESSION_SECRET", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ success: true, result: {}, errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    const client = new CfClient(creds, fetchImpl as unknown as typeof fetch);

    await uploadWorkerScript(client, {
      name: "my-worker",
      code: "export default {}",
      mainModuleFilename: "worker.js",
      compatibilityDate: "2025-01-01",
      bindings: [{ type: "d1", name: "DB", id: "d1-id" }],
    });

    const metadata = await metadataFrom(captured);
    expect(metadata.keep_secrets).toBe(true);
    expect(metadata.main_module).toBe("worker.js");
  });

  it("attaches the SPA assets config so /admin serves index.html on the deployed Worker", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ success: true, result: {}, errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    const client = new CfClient(creds, fetchImpl as unknown as typeof fetch);

    await uploadWorkerScript(client, {
      name: "my-worker",
      code: "export default {}",
      mainModuleFilename: "worker.js",
      compatibilityDate: "2025-01-01",
      bindings: [],
      assetsJwt: "completion-jwt",
      assetsConfig: { not_found_handling: "single-page-application", run_worker_first: ["/admin/api/*"] },
    });

    const metadata = await metadataFrom(captured);
    const assets = metadata.assets as { jwt: string; config: { not_found_handling: string; run_worker_first: string[] } };
    expect(assets.jwt).toBe("completion-jwt");
    expect(assets.config.not_found_handling).toBe("single-page-application");
    expect(assets.config.run_worker_first).toContain("/admin/api/*");
  });
});
