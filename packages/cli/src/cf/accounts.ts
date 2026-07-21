import type { CfClient } from "./client.js";

export interface CfAccount {
  id: string;
  name: string;
}

interface AccountInfo {
  id: string;
  name: string;
}

/**
 * List the accounts a token can access. The list endpoint is not
 * account-scoped, so a client built with an empty accountId is fine — this both
 * validates the token and discovers the account id for `edgecms login`.
 */
export async function listAccounts(client: CfClient): Promise<CfAccount[]> {
  const accounts = await client.request<AccountInfo[]>("GET", "/accounts");
  return accounts.map((a) => ({ id: a.id, name: a.name }));
}
