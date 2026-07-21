import { type StorageAdapter, type StorageObject } from "@edgecms/core";

/** A fetch that signs requests (AWS SigV4). Injectable so tests need no signer. */
export type SignedFetch = (input: Request) => Promise<Response>;

export interface S3AdapterOptions {
  /** Bucket name. */
  bucket: string;
  /**
   * Service endpoint origin, e.g. `https://s3.us-east-1.amazonaws.com`,
   * `https://<account>.r2.cloudflarestorage.com`, or a MinIO URL. No bucket or
   * trailing slash.
   */
  endpoint: string;
  /** Path-style (`/{bucket}/{key}`) vs virtual-host (`{bucket}.host/{key}`). */
  forcePathStyle?: boolean;
  /** The SigV4-signing fetch (see `createS3Adapter` for the aws4fetch default). */
  signedFetch: SignedFetch;
}

/**
 * S3-compatible StorageAdapter (AWS S3, R2's S3 API, MinIO, …). All auth lives
 * in the injected `signedFetch`, so the adapter itself is pure request-shaping
 * and fully unit-testable without credentials. Object bytes stream through a
 * Worker exactly like the R2 adapter — presigned URLs are a separate concern.
 */
export class S3Adapter implements StorageAdapter {
  constructor(private readonly opts: S3AdapterOptions) {}

  private url(key: string): string {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const base = this.opts.endpoint.replace(/\/+$/, "");
    if (this.opts.forcePathStyle ?? true) {
      return `${base}/${encodeURIComponent(this.opts.bucket)}/${encodedKey}`;
    }
    const u = new URL(base);
    return `${u.protocol}//${this.opts.bucket}.${u.host}/${encodedKey}`;
  }

  async put(
    key: string,
    body: ReadableStream | ArrayBuffer,
    contentType: string,
  ): Promise<StorageObject> {
    const headers: Record<string, string> = { "content-type": contentType };
    let size = 0;
    if (body instanceof ArrayBuffer) {
      size = body.byteLength;
      headers["content-length"] = String(size);
    }
    const res = await this.opts.signedFetch(
      new Request(this.url(key), { method: "PUT", body, headers }),
    );
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status} ${await safeText(res)}`);
    return { key, size, contentType };
  }

  async get(
    key: string,
  ): Promise<{ body: ReadableStream; contentType: string; size: number } | null> {
    const res = await this.opts.signedFetch(new Request(this.url(key), { method: "GET" }));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status} ${await safeText(res)}`);
    if (!res.body) return null;
    return {
      body: res.body,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      size: Number(res.headers.get("content-length") ?? 0),
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.opts.signedFetch(new Request(this.url(key), { method: "DELETE" }));
    // S3 DELETE is idempotent and returns 204; treat 404 as already-gone.
    if (!res.ok && res.status !== 404)
      throw new Error(`S3 DELETE ${key} failed: ${res.status} ${await safeText(res)}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}
