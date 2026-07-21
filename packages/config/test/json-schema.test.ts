import { describe, expect, it } from "vitest";
import { configJsonSchema } from "../src/index.js";

describe("configJsonSchema", () => {
  it("exports a draft-7 JSON schema describing the config shape", () => {
    const schema = configJsonSchema() as {
      $schema?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.$schema).toContain("draft-07");
    expect(Object.keys(schema.properties ?? {})).toEqual(
      expect.arrayContaining(["name", "database", "storage", "collections"]),
    );
    expect(schema.required).toEqual(expect.arrayContaining(["name", "collections"]));
  });
});
