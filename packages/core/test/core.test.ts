import { describe, expect, it } from "vitest";
import { EdgeCMSError, MAX_LIMIT, slugify, ulid } from "../src/index.js";

describe("ulid", () => {
  it("generates 26-char sortable ids", () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a).toHaveLength(26);
    expect(a.localeCompare(b)).toBeLessThan(0);
  });

  it("is unique across rapid calls at the same timestamp", () => {
    const ids = new Set(Array.from({ length: 50 }, () => ulid(1000)));
    expect(ids.size).toBe(50);
  });
});

describe("slugify", () => {
  it("lowercases, strips accents, and dashes non-alphanumerics", () => {
    expect(slugify("Héllo, World!")).toBe("hello-world");
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
  });

  it("caps length at 80", () => {
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });
});

describe("EdgeCMSError", () => {
  it("maps codes to HTTP status and serializes to the shared error body shape", () => {
    const err = new EdgeCMSError("validation_failed", "bad title", [
      { path: "title", message: "required" },
    ]);
    expect(err.status).toBe(422);
    expect(err.toBody()).toEqual({
      error: { code: "validation_failed", message: "bad title", details: [{ path: "title", message: "required" }] },
    });
  });

  it("omits details when none given", () => {
    const err = new EdgeCMSError("not_found", "missing");
    expect(err.toBody()).toEqual({ error: { code: "not_found", message: "missing" } });
  });
});

describe("MAX_LIMIT", () => {
  it("is 100 per the locked query DSL decision", () => {
    expect(MAX_LIMIT).toBe(100);
  });
});
