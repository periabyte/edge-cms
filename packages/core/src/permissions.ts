/**
 * Framework-free RBAC checker shared by the runtime (enforcement) and the admin
 * SPA (hiding actions a user can't perform). Dependency-free — the permission
 * model is a static role→grant matrix, so a tiny checker beats pulling a policy
 * library into the Worker bundle.
 *
 * The permission *vocabulary* (actions, grant/role shapes, the system-subject
 * list, the built-in roles) is defined in @kalayaan/config, which is the more
 * foundational package. This module only adds the runtime `Ability`.
 *
 * A grant pairs a set of `subjects` with a set of `actions`. A subject is
 * either a collection name or one of the fixed system areas (SYSTEM_SUBJECTS).
 * The `"*"` subject wildcard matches every *collection* but never a system
 * subject — so `{ subjects: "*", actions: [...] }` grants content access
 * without handing out user/key management by accident.
 */
import {
  SYSTEM_SUBJECTS,
  type PermissionAction,
  type PermissionGrant,
  type RolesConfig,
} from "@kalayaan/config";

export type Action = PermissionAction;

export const ACTIONS: readonly Action[] = ["read", "create", "update", "delete", "publish", "manage"];

const SYSTEM_SET = new Set<string>(SYSTEM_SUBJECTS);

/**
 * A resolved, immutable permission checker. Serializes with {@link Ability.toJSON}
 * so the same rules can be shipped to the browser and rebuilt via
 * {@link Ability.fromJSON}.
 */
export class Ability {
  constructor(
    private readonly grants: PermissionGrant[],
    private readonly superuser = false,
  ) {}

  can(action: Action, subject: string): boolean {
    if (this.superuser) return true;
    return this.grants.some(
      (g) => grantMatchesAction(g, action) && grantMatchesSubject(g, subject),
    );
  }

  cannot(action: Action, subject: string): boolean {
    return !this.can(action, subject);
  }

  get isSuperuser(): boolean {
    return this.superuser;
  }

  toJSON(): AbilityRules {
    return { grants: this.grants, superuser: this.superuser };
  }

  static fromJSON(rules: AbilityRules): Ability {
    return new Ability(rules.grants ?? [], rules.superuser ?? false);
  }
}

export interface AbilityRules {
  grants: PermissionGrant[];
  superuser?: boolean;
}

function grantMatchesAction(g: PermissionGrant, action: Action): boolean {
  return g.actions === "*" || g.actions.includes(action);
}

function grantMatchesSubject(g: PermissionGrant, subject: string): boolean {
  if (g.subjects === "*") return !SYSTEM_SET.has(subject);
  return g.subjects.includes(subject);
}

export function createAbility(grants: PermissionGrant[], superuser = false): Ability {
  return new Ability(grants, superuser);
}

/** Build an ability for a named role, falling back to no permissions if unknown. */
export function abilityForRole(role: string, roles: RolesConfig): Ability {
  const def = roles[role];
  if (!def) return new Ability([]);
  return new Ability(def.permissions, def.admin ?? false);
}

/** True when `role` names a superuser role in `roles`. */
export function isAdminRole(role: string, roles: RolesConfig): boolean {
  return roles[role]?.admin === true;
}
