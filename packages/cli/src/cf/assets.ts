import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { CfClient } from "./client.js";

interface AssetManifestEntry {
  hash: string;
  size: number;
}

interface UploadSessionResponse {
  jwt?: string;
  buckets: string[][];
}

/**
 * Uploads the admin SPA's built assets via the Workers Assets upload-session
 * flow: hash every file, ask Cloudflare which hashes it doesn't have yet,
 * upload only those (bucketed as the API instructs), then return the
 * completion JWT the script-upload call references in its assets config.
 */
export async function uploadAssets(client: CfClient, workerName: string, distDir: string): Promise<string> {
  const files = await collectFiles(distDir);
  const manifest: Record<string, AssetManifestEntry> = {};
  const contents = new Map<string, Buffer>();
  const contentTypes = new Map<string, string>();

  for (const absPath of files) {
    const relPath = "/" + relative(distDir, absPath).split(sep).join("/");
    const buf = await readFile(absPath);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
    manifest[relPath] = { hash, size: buf.byteLength };
    contents.set(hash, buf);
    contentTypes.set(hash, contentTypeFor(absPath));
  }

  const session = await client.request<UploadSessionResponse>(
    "POST",
    `/accounts/${client.accountId}/workers/scripts/${workerName}/assets-upload-session`,
    { body: { manifest } },
  );

  // No buckets means every asset already exists — session.jwt is the
  // completion token and there's nothing to upload.
  const buckets = session.buckets ?? [];
  if (buckets.length === 0) {
    if (!session.jwt) throw new Error("Asset upload-session returned no completion token");
    return session.jwt;
  }

  // There are files to upload. The upload endpoint authenticates with the
  // session JWT (NOT the account API token), and each file is sent base64-
  // encoded with its content type — matching Cloudflare's direct-upload flow.
  if (!session.jwt) throw new Error("Asset upload-session returned no upload token");
  let completionJwt: string | undefined;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const buf = contents.get(hash);
      if (!buf) continue;
      form.append(hash, new Blob([buf.toString("base64")], { type: contentTypes.get(hash) ?? "application/octet-stream" }), hash);
    }
    const result = await client.request<{ jwt?: string }>(
      "POST",
      `/accounts/${client.accountId}/workers/assets/upload?base64=true`,
      { formData: form, token: session.jwt },
    );
    if (result.jwt) completionJwt = result.jwt;
  }

  if (!completionJwt) throw new Error("Asset upload did not return a completion token");
  return completionJwt;
}

/** Minimal extension→MIME map for the admin SPA's asset types. */
const MIME_BY_EXT: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain",
  map: "application/json",
  wasm: "application/wasm",
};

function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(dir);
  return out;
}
