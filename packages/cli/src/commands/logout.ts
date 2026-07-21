import { clearStoredCredentials } from "../credentials-store.js";

/** Remove stored Cloudflare credentials. Returns false if there were none. */
export async function runLogout(home?: string): Promise<boolean> {
  return clearStoredCredentials(home);
}
