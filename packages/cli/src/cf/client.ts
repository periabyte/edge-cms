import { readStoredCredentials } from "../credentials-store.js";

export interface CfCredentials {
  apiToken: string;
  accountId: string;
}

export interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: { code: number; message: string }[];
}

export class CfApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: { code: number; message: string }[],
  ) {
    super(message);
    this.name = "CfApiError";
  }
}

const BASE_URL = "https://api.cloudflare.com/client/v4";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

/**
 * Thin, typed wrapper over the Cloudflare REST API with retry/backoff on
 * rate limits and transient 5xxs. Every provisioning call in cf/*.ts goes
 * through this so retry behavior lives in one place.
 */
export class CfClient {
  constructor(
    private readonly creds: CfCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get accountId(): string {
    return this.creds.accountId;
  }

  async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; formData?: FormData; token?: string } = {},
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(2 ** attempt * 250);

      // Most calls use the account API token; the Workers Assets upload
      // endpoint instead authenticates with the per-session JWT (opts.token).
      const headers: Record<string, string> = {
        authorization: `Bearer ${opts.token ?? this.creds.apiToken}`,
      };
      let body: FormData | string | undefined;
      if (opts.formData) {
        body = opts.formData;
      } else if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.body);
      }

      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, ...(body !== undefined && { body }) });
      } catch (err) {
        lastError = err;
        continue;
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        lastError = new CfApiError(`Cloudflare API ${res.status}`, res.status, []);
        continue;
      }

      const json = (await res.json()) as CfResponse<T>;
      if (!json.success) {
        throw new CfApiError(
          json.errors.map((e) => e.message).join("; ") || `Cloudflare API request failed`,
          res.status,
          json.errors,
        );
      }
      return json.result;
    }

    throw lastError instanceof Error ? lastError : new Error("Cloudflare API request failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): CfCredentials | null {
  // Prefixed so a shell/CI environment already carrying wrangler's own
  // CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (e.g. for local wrangler
  // dev work) doesn't get silently picked up here for a different account.
  const apiToken = env.EDGE_API_TOKEN;
  const accountId = env.EDGE_ACCOUNT_ID;
  if (!apiToken || !accountId) return null;
  return { apiToken, accountId };
}

/**
 * Resolve credentials for a command: environment first (so CI and one-off
 * overrides win), otherwise the `edgecms login` store. Returns null when neither
 * is available — callers point the user at `edgecms login`.
 */
export async function resolveCredentials(env: NodeJS.ProcessEnv = process.env): Promise<CfCredentials | null> {
  const fromEnv = credentialsFromEnv(env);
  if (fromEnv) return fromEnv;
  return readStoredCredentials();
}
