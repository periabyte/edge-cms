import { S3Adapter, type S3AdapterOptions, type SignedFetch } from "./adapter.js";

export { S3Adapter, type S3AdapterOptions, type SignedFetch };

export interface S3Credentials {
  bucket: string;
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle?: boolean;
}

/** Structural type for aws4fetch's AwsClient, imported lazily. */
interface AwsClientCtor {
  new (opts: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region?: string;
    service?: string;
  }): { fetch(input: Request): Promise<Response> };
}

/**
 * Build an S3Adapter that signs with aws4fetch (SigV4). aws4fetch is imported
 * lazily so this package carries no build-time dependency on it; install it
 * only when actually using S3 storage.
 */
export async function createS3Adapter(creds: S3Credentials): Promise<S3Adapter> {
  const mod = (await import("aws4fetch" as string)) as { AwsClient: AwsClientCtor };
  const client = new mod.AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    ...(creds.sessionToken !== undefined && { sessionToken: creds.sessionToken }),
    region: creds.region ?? "auto",
    service: "s3",
  });
  return new S3Adapter({
    bucket: creds.bucket,
    endpoint: creds.endpoint,
    ...(creds.forcePathStyle !== undefined && { forcePathStyle: creds.forcePathStyle }),
    signedFetch: (input) => client.fetch(input),
  });
}
