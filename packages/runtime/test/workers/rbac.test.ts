import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@edgecms/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { UsersStore } from "../../src/auth/users-store.js";
import { authHeaders, loginAs, type AuthedRequest } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

const PW = "supersecretpassword";

// Seed users directly into the DB baseline. Worker requests (SELF.fetch) are
// confined to test bodies — doing them in before* hooks, and splitting across
// many small tests, desyncs the workers pool's isolated-storage stack. So this
// file keeps a handful of broad tests, each logging in at the top.
beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();

  const users = new UsersStore(db);
  await users.create("admin@example.com", PW, "admin");
  await users.create("editor@example.com", PW, "editor");
  await users.create("viewer@example.com", PW, "viewer");
});

async function logins(): Promise<{ admin: AuthedRequest; editor: AuthedRequest; viewer: AuthedRequest }> {
  // Sequential (not Promise.all): concurrent worker requests can imbalance the
  // pool's isolated-storage stack and fail the suite teardown.
  const admin = await loginAs("admin@example.com", PW);
  const editor = await loginAs("editor@example.com", PW);
  const viewer = await loginAs("viewer@example.com", PW);
  return { admin, editor, viewer };
}

const post = (path: string, auth: AuthedRequest, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });
const bearer = (path: string, key: string, init: RequestInit = {}) =>
  SELF.fetch(`https://x${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${key}` } });

describe("RBAC and scoped tokens", () => {
  it("enforces user roles across content and management areas", async () => {
    const { admin, editor, viewer } = await logins();

    // Editor: authors content, but no access to users or API keys.
    expect((await post("/admin/api/posts", editor, { title: "Editor post", slug: "editor-post" })).status).toBe(201);
    expect((await SELF.fetch("https://x/admin/api/users", { headers: { cookie: editor.cookie } })).status).toBe(403);
    expect((await SELF.fetch("https://x/admin/api/auth/api-keys", { headers: { cookie: editor.cookie } })).status).toBe(403);

    // Viewer: read-only.
    expect((await SELF.fetch("https://x/admin/api/posts", { headers: { cookie: viewer.cookie } })).status).toBe(200);
    expect((await post("/admin/api/posts", viewer, { title: "Nope", slug: "nope" })).status).toBe(403);

    // Admin: manages users; the roles list is surfaced for the UI.
    const usersRes = await SELF.fetch("https://x/admin/api/users", { headers: { cookie: admin.cookie } });
    expect(usersRes.status).toBe(200);
    const { users, roles } = (await usersRes.json()) as {
      users: { id: string; email: string }[];
      roles: { name: string }[];
    };
    expect(roles.map((r) => r.name)).toContain("editor");

    // Last-admin guard: the only admin can't be demoted.
    const adminUser = users.find((u) => u.email === "admin@example.com")!;
    const demote = await SELF.fetch(`https://x/admin/api/users/${adminUser.id}`, {
      method: "PATCH",
      headers: authHeaders(admin),
      body: JSON.stringify({ role: "editor" }),
    });
    expect(demote.status).toBe(403);
  });

  it("enforces token grants, expiry, and revocation", async () => {
    const { admin } = await logins();

    // Expired key is rejected.
    const expired = (await (
      await post("/admin/api/auth/api-keys", admin, {
        name: "expired",
        grants: [{ subjects: "*", actions: ["read"] }],
        expiresAt: Date.now() - 1000,
      })
    ).json()) as { rawKey: string };
    expect((await bearer("/admin/api/posts", expired.rawKey)).status).toBe(401);

    // A create-only key on `posts` can create but not delete.
    const scoped = (await (
      await post("/admin/api/auth/api-keys", admin, {
        name: "create-only",
        grants: [{ subjects: ["posts"], actions: ["read", "create"] }],
      })
    ).json()) as { key: { id: string }; rawKey: string };
    const created = await bearer("/admin/api/posts", scoped.rawKey, {
      method: "POST",
      body: JSON.stringify({ title: "Key made this", slug: "key-made-this" }),
    });
    expect(created.status).toBe(201);
    const { doc } = (await created.json()) as { doc: { id: string } };
    expect((await bearer(`/admin/api/posts/${doc.id}`, scoped.rawKey, { method: "DELETE" })).status).toBe(403);

    // Revoking a key immediately kills access.
    expect((await bearer("/admin/api/posts", scoped.rawKey)).status).toBe(200);
    await SELF.fetch(`https://x/admin/api/auth/api-keys/${scoped.key.id}/revoke`, {
      method: "POST",
      headers: authHeaders(admin),
    });
    expect((await bearer("/admin/api/posts", scoped.rawKey)).status).toBe(401);
  });

  it("records management actions in an admin-only audit trail", async () => {
    const { admin, viewer } = await logins();
    await post("/admin/api/users", admin, { email: "audited@example.com", password: PW, role: "editor" });
    await post("/admin/api/auth/api-keys", admin, { name: "audit-key", grants: [{ subjects: "*", actions: ["read"] }] });

    const res = await SELF.fetch("https://x/admin/api/auth/audit", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as { entries: { action: string }[] };
    expect(entries.some((e) => e.action === "user.create")).toBe(true);
    expect(entries.some((e) => e.action === "api_key.create")).toBe(true);

    // Non-admins can't read the audit trail.
    expect((await SELF.fetch("https://x/admin/api/auth/audit", { headers: { cookie: viewer.cookie } })).status).toBe(403);
  });
});
