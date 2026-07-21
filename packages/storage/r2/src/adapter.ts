import type { StorageAdapter, StorageObject } from "@edgecms/core";

export class R2Adapter implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<StorageObject> {
    const obj = await this.bucket.put(key, body, { httpMetadata: { contentType } });
    if (!obj) throw new Error(`R2 put failed for key "${key}"`);
    return { key, size: obj.size, contentType };
  }

  async get(
    key: string,
  ): Promise<{ body: ReadableStream; contentType: string; size: number } | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
