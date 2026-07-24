import type { Context, MiddlewareHandler } from "hono";
import { EdgeCMSError, Ability, abilityForRole, createAbility, type Action } from "@kalayaan/core";
import { defaultRoles, PUBLIC_ROLE, type RolesConfig } from "@kalayaan/config";
import { ApiKeysStore } from "./api-keys.js";
import { readSession } from "./session.js";
import { UsersStore } from "./users-store.js";
import { getCookie } from "hono/cookie";
import { verifyAccessJwt } from "./cloudflare-access.js";

/**
 * The authenticated principal for a request. Both users and API keys resolve to
 * an {@link Ability}, so every authorization decision downstream is a single
 * `actor.ability.can(action, subject)` — see {@link requirePermission}.
 */
export type Actor =
  | { type: "user"; id: string; role: string; ability: Ability }
  | { type: "apiKey"; id: string; ability: Ability }
  | { type: "anonymous"; id: null; ability: Ability };

export interface AuthEnv {
  Bindings: {
    DB: D1Database;
    SESSIONS: KVNamespace;
    SESSION_SECRET: string;
    /** Cloudflare Access: application AUD tag. Presence enables Access auth. */
    ACCESS_AUD?: string;
    /** Cloudflare Access: team domain, e.g. https://acme.cloudflareaccess.com */
    ACCESS_TEAM_DOMAIN?: string;
  };
  Variables: {
    actor: Actor;
    /** Role→permission matrix. Set app-wide from config; defaults if unset. */
    roles?: RolesConfig;
  };
}

/** The active role matrix — the config's roles, or the built-ins in isolation (tests). */
export function rolesOf(c: Context<AuthEnv>): RolesConfig {
  return c.var.roles ?? defaultRoles();
}

/** Session cookie, Cloudflare Access, OR bearer API key. Unauthorized if none resolve. */
export function requireAuth(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const actor = await resolveActor(c);
    if (!actor) throw new EdgeCMSError("unauthorized", "Authentication required");
    c.set("actor", actor);
    await next();
  };
}

async function resolveActor(c: Context<AuthEnv>): Promise<Actor | null> {
  const roles = rolesOf(c);

  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice("Bearer ".length).trim();
    const record = await new ApiKeysStore(c.env.DB).findByRawKey(rawKey);
    if (!record) return null;
    return { type: "apiKey", id: record.id, ability: createAbility(record.grants) };
  }

  // Cloudflare Access: a verified edge identity maps to a CMS user, auto-
  // provisioned on first sight (admin if the very first user, else editor).
  const accessJwt = c.req.header("cf-access-jwt-assertion") ?? getCookie(c, "CF_Authorization");
  if (accessJwt && c.env.ACCESS_AUD && c.env.ACCESS_TEAM_DOMAIN) {
    const identity = await verifyAccessJwt(accessJwt, {
      aud: c.env.ACCESS_AUD,
      teamDomain: c.env.ACCESS_TEAM_DOMAIN,
    }).catch(() => null);
    if (identity) {
      const users = new UsersStore(c.env.DB);
      const existing = await users.findByEmail(identity.email);
      if (existing?.disabledAt != null) return null;
      const user =
        existing ?? (await users.createExternal(identity.email, (await users.count()) === 0 ? "admin" : "editor"));
      return { type: "user", id: user.id, role: user.role, ability: abilityForRole(user.role, roles) };
    }
  }

  const session = await readSession(c, c.env.SESSIONS, c.env.SESSION_SECRET);
  if (!session) return null;
  const user = await new UsersStore(c.env.DB).findById(session.userId);
  if (!user || user.disabledAt != null) return null;
  return { type: "user", id: user.id, role: user.role, ability: abilityForRole(user.role, roles) };
}

/**
 * Public routes: resolve a real actor if credentials are present, otherwise fall
 * back to an anonymous actor whose ability comes from the `public` role. Never
 * throws — unlike {@link requireAuth}, absence of auth is allowed. Downstream
 * `can`/`requirePermission`/`assertPermission` work unchanged.
 */
export function publicAuth(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const actor = (await resolveActor(c)) ?? {
      type: "anonymous" as const,
      id: null,
      ability: abilityForRole(PUBLIC_ROLE, rolesOf(c)),
    };
    c.set("actor", actor);
    await next();
  };
}

/** Read the actor's ability. Assumes {@link requireAuth}/{@link publicAuth} ran. */
export function can(c: { var: { actor: Actor } }, action: Action, subject: string): boolean {
  return c.var.actor.ability.can(action, subject);
}

/**
 * Enforce `action` on `subject`. When `subject` is omitted, it is taken from
 * the `:collection` route param — the common case for content CRUD. Throws
 * `forbidden` when the actor's ability doesn't allow it.
 */
export function requirePermission(action: Action, subject?: string): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const target = subject ?? c.req.param("collection");
    if (!target) throw new EdgeCMSError("bad_request", "No subject to authorize against");
    if (!c.var.actor.ability.can(action, target))
      throw new EdgeCMSError("forbidden", `Not permitted to ${action} "${target}"`);
    await next();
  };
}

/**
 * Assert a permission from inside a handler (used where the required action is
 * only known after reading the body — e.g. a write that also publishes).
 */
export function assertPermission(c: { var: { actor: Actor } }, action: Action, subject: string): void {
  if (!c.var.actor.ability.can(action, subject))
    throw new EdgeCMSError("forbidden", `Not permitted to ${action} "${subject}"`);
}
