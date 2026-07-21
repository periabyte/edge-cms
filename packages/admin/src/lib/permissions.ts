import { SYSTEM_SUBJECTS, type PermissionAction, type PermissionGrant } from "@edgecms/config";
import type { AbilityRules } from "./types.js";
import { useAbilityRules } from "./hooks.js";

/**
 * Client-side permission check. Mirrors @edgecms/core's `Ability` so the admin
 * can hide actions a user can't perform — the server still enforces the same
 * rules, this is purely for UX. The `"*"` subject matches collections only,
 * never a system subject (users, api_keys, webhooks, settings, media, ai).
 */
const SYSTEM_SET = new Set<string>(SYSTEM_SUBJECTS);

export function can(rules: AbilityRules | undefined, action: PermissionAction, subject: string): boolean {
  if (!rules) return false;
  if (rules.superuser) return true;
  return rules.grants.some((g) => matchesAction(g, action) && matchesSubject(g, subject));
}

function matchesAction(g: PermissionGrant, action: PermissionAction): boolean {
  return g.actions === "*" || g.actions.includes(action);
}

function matchesSubject(g: PermissionGrant, subject: string): boolean {
  if (g.subjects === "*") return !SYSTEM_SET.has(subject);
  return g.subjects.includes(subject);
}

/** Hook form: `useCan("manage", "users")`. Returns false until rules load. */
export function useCan(action: PermissionAction, subject: string): boolean {
  const { data: rules } = useAbilityRules();
  return can(rules, action, subject);
}
