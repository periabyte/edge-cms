import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CfClient } from "../../src/cf/client.js";
import { uploadAssets } from "../../src/cf/assets.js";
import { mockFetch, type MockRoute } from "./mock-fetch.js";

let dir: string;
const creds = { apiToken: "account-token-xyz", accountId: "acct" };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "edgecms-assets-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><title>x</title>");
  await writeFile(join(dir, "app.js"), "console.log(1)");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("uploadAssets", () => {
  it("uploads files authenticated with the session JWT (not the account token) and returns the completion token", async () => {
    let sessionHashes: string[] = [];
    const routes: MockRoute[] = [
      {
        method: "POST",
        path: /\/workers\/scripts\/[^/]+\/assets-upload-session/,
        respond: ({ body }) => {
          // Bucket every manifest hash so the upload path actually runs.
          const manifest = (body as { manifest: Record<string, { hash: string }> }).manifest;
          sessionHashes = Object.values(manifest).map((e) => e.hash);
          return { result: { jwt: "session-upload-jwt", buckets: [sessionHashes] } };
        },
      },
      {
        method: "POST",
        path: /\/workers\/assets\/upload/,
        respond: () => ({ result: { jwt: "completion-jwt" } }),
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const client = new CfClient(creds, fetch);

    const jwt = await uploadAssets(client, "my-worker", dir);
    expect(jwt).toBe("completion-jwt");

    const uploadCall = calls.find((c) => c.path.endsWith("/workers/assets/upload"));
    expect(uploadCall).toBeDefined();
    // Authenticated with the per-session JWT, NOT the account API token.
    expect(uploadCall!.authorization).toBe("Bearer session-upload-jwt");
    expect(uploadCall!.authorization).not.toContain(creds.apiToken);
    // base64 upload flow.
    expect(uploadCall!.query).toContain("base64=true");
  });

  it("short-circuits to the completion token when nothing needs uploading (empty buckets)", async () => {
    const { fetch, calls } = mockFetch([
      {
        method: "POST",
        path: /\/workers\/scripts\/[^/]+\/assets-upload-session/,
        respond: () => ({ result: { jwt: "already-complete-jwt", buckets: [] } }),
      },
    ]);
    const client = new CfClient(creds, fetch);

    const jwt = await uploadAssets(client, "my-worker", dir);
    expect(jwt).toBe("already-complete-jwt");
    // No file-upload call when there's nothing to upload.
    expect(calls.some((c) => c.path.endsWith("/workers/assets/upload"))).toBe(false);
  });
});
