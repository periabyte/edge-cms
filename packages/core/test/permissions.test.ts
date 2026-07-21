import { describe, expect, it } from "vitest";
import { Ability, abilityForRole, createAbility, isAdminRole } from "../src/index.js";
import { defaultRoles } from "@edgecms/config";

describe("Ability", () => {
  it("matches granted action + subject", () => {
    const a = createAbility([{ subjects: ["posts"], actions: ["read", "create"] }]);
    expect(a.can("read", "posts")).toBe(true);
    expect(a.can("create", "posts")).toBe(true);
    expect(a.can("delete", "posts")).toBe(false);
    expect(a.can("read", "authors")).toBe(false);
  });

  it("treats the '*' subject as all collections but never a system subject", () => {
    const a = createAbility([{ subjects: "*", actions: ["read", "create", "update", "delete", "publish"] }]);
    expect(a.can("create", "posts")).toBe(true);
    expect(a.can("create", "anything_else")).toBe(true);
    // System subjects are excluded from the wildcard.
    expect(a.can("manage", "users")).toBe(false);
    expect(a.can("read", "api_keys")).toBe(false);
    expect(a.can("create", "webhooks")).toBe(false);
  });

  it("'*' action grants every action on the listed subjects", () => {
    const a = createAbility([{ subjects: ["media"], actions: "*" }]);
    expect(a.can("read", "media")).toBe(true);
    expect(a.can("delete", "media")).toBe(true);
    expect(a.can("manage", "media")).toBe(true);
  });

  it("superuser passes everything", () => {
    const a = createAbility([], true);
    expect(a.can("manage", "users")).toBe(true);
    expect(a.can("delete", "anything")).toBe(true);
  });

  it("round-trips through toJSON/fromJSON", () => {
    const a = createAbility([{ subjects: ["posts"], actions: ["read"] }], false);
    const b = Ability.fromJSON(a.toJSON());
    expect(b.can("read", "posts")).toBe(true);
    expect(b.can("create", "posts")).toBe(false);
  });
});

describe("built-in roles", () => {
  const roles = defaultRoles();

  it("admin is a superuser", () => {
    expect(isAdminRole("admin", roles)).toBe(true);
    const a = abilityForRole("admin", roles);
    expect(a.can("manage", "users")).toBe(true);
    expect(a.can("delete", "posts")).toBe(true);
  });

  it("editor authors content + media but not management areas", () => {
    const a = abilityForRole("editor", roles);
    expect(a.can("create", "posts")).toBe(true);
    expect(a.can("publish", "posts")).toBe(true);
    expect(a.can("delete", "media")).toBe(true);
    expect(a.can("manage", "users")).toBe(false);
    expect(a.can("manage", "api_keys")).toBe(false);
    expect(a.can("manage", "webhooks")).toBe(false);
  });

  it("viewer is read-only", () => {
    const a = abilityForRole("viewer", roles);
    expect(a.can("read", "posts")).toBe(true);
    expect(a.can("read", "media")).toBe(true);
    expect(a.can("create", "posts")).toBe(false);
    expect(a.can("delete", "posts")).toBe(false);
  });

  it("returns an empty ability for an unknown role", () => {
    const a = abilityForRole("nope", roles);
    expect(a.can("read", "posts")).toBe(false);
  });
});
