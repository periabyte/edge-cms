import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { PluginHost } from "@kalayaan/core";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testResolved, testSnapshot } from "../fixture.js";
import { UsersStore } from "../../src/auth/users-store.js";
import { createDocument } from "../../src/content/create-document.js";
import { authHeaders, loginAs } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

const PW = "supersecretpassword";

beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  await new UsersStore(db).create("admin@example.com", PW, "admin");
});

describe("email invites + public endpoints", () => {
  it("invites a user with a random temporary password and accepts via the signed link", async () => {
    const admin = await loginAs("admin@example.com", PW);

    // No password → invite. Email isn't configured in tests, so the response
    // carries a copyable inviteUrl, emailed:false, AND the generated temporary
    // password (so the account is loginable even before the link is used).
    const created = await SELF.fetch("https://x/admin/api/users", {
      method: "POST",
      headers: authHeaders(admin),
      body: JSON.stringify({ email: "invitee@example.com", role: "editor" }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { inviteUrl: string; emailed: boolean; temporaryPassword: string };
    expect(body.emailed).toBe(false);
    expect(body.temporaryPassword).toBeTruthy();
    const token = new URL(body.inviteUrl).searchParams.get("token")!;
    expect(token).toBeTruthy();

    // Can log in right away with the temporary password, before ever visiting the link.
    const tempLogin = await SELF.fetch("https://x/admin/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "invitee@example.com", password: body.temporaryPassword }),
    });
    expect(tempLogin.status).toBe(200);

    // Accept: overwrites the temporary password with their own and returns a session.
    const accept = await SELF.fetch("https://x/admin/api/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, password: PW }),
    });
    expect(accept.status).toBe(201);

    // The old temporary password no longer works; their own password does.
    const oldLogin = await SELF.fetch("https://x/admin/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "invitee@example.com", password: body.temporaryPassword }),
    });
    expect(oldLogin.status).toBe(401);
    const login = await SELF.fetch("https://x/admin/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "invitee@example.com", password: PW }),
    });
    expect(login.status).toBe(200);
  });

  it("serves published content anonymously (default public role) but hides drafts", async () => {
    // Seed a published and a draft post directly.
    const db = (env as unknown as TestEnv).DB;
    const adapter = new D1Adapter(db, testSnapshot());
    await adapter.create("posts", { title: "Live", slug: "live", published_at: Date.now() });
    await adapter.create("posts", { title: "Draft", slug: "draft" });

    const res = await SELF.fetch("https://x/api/v1/posts");
    expect(res.status).toBe(200);
    const { docs } = (await res.json()) as { docs: { slug: string }[] };
    const slugs = docs.map((d) => d.slug);
    expect(slugs).toContain("live");
    expect(slugs).not.toContain("draft");
  });

  it("disables public submission when Turnstile isn't configured", async () => {
    // No TURNSTILE_SECRET binding in the test env → submissions are turned off.
    const res = await SELF.fetch("https://x/api/v1/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Spam", slug: "spam" }),
    });
    expect(res.status).toBe(403);
  });

  it("createDocument lands new content as an unpublished draft", async () => {
    const db = (env as unknown as TestEnv).DB;
    const adapter = new D1Adapter(db, testSnapshot());
    const collection = testResolved().collections.find((c) => c.name === "posts")!;
    const c = {
      var: { adapter },
      env: { DB: db },
      executionCtx: { waitUntil: () => {} },
    };
    const doc = await createDocument(
      c as never,
      { config: testResolved(), plugins: new PluginHost() },
      { collection, data: { title: "Submitted", slug: "submitted" }, actor: { type: "anonymous", id: null } },
    );
    expect(doc.published_at ?? null).toBeNull();
    const found = await adapter.findOne({ collection: "posts", id: doc.id });
    expect(found?.title).toBe("Submitted");
  });
});
