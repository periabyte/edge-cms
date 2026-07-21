import { describe, expect, it } from "vitest";
import { generateEntrySource } from "../src/entry-template.js";

describe("generateEntrySource", () => {
  it("imports the config path, resolves it, and exports a fetch handler", () => {
    const src = generateEntrySource("./config.generated.mjs");
    expect(src).toContain('import userConfig from "./config.generated.mjs"');
    // Imports only from "edgecms" (the umbrella package), never the
    // scoped @edgecms/* packages directly — see entry-template.ts for why.
    expect(src).toContain('from "edgecms"');
    expect(src).not.toContain("@edgecms/");
    expect(src).toContain("resolveConfig(userConfig)");
    expect(src).toContain("export default {");
    expect(src).toContain("fetch:");
  });

  it("embeds the exact given import path (JSON-escaped, so special characters stay valid)", () => {
    const src = generateEntrySource("../weird path/config.mjs");
    expect(src).toContain(JSON.stringify("../weird path/config.mjs"));
  });

  it("imports NO external adapter for a D1 project (keeps mysql2/postgres out of the bundle)", () => {
    const src = generateEntrySource("./config.generated.mjs", "d1");
    expect(src).not.toContain("edgecms/postgres");
    expect(src).not.toContain("edgecms/mysql");
    expect(src).toContain("createApp(resolved, snapshot)");
  });

  it("wires the Postgres adapter factory only for a Postgres project", () => {
    const src = generateEntrySource("./config.generated.mjs", "postgres");
    expect(src).toContain('import { postgresAdapter } from "edgecms/postgres"');
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: postgresAdapter })");
    expect(src).not.toContain("edgecms/mysql");
  });

  it("wires the MySQL adapter factory only for a MySQL project", () => {
    const src = generateEntrySource("./config.generated.mjs", "mysql");
    expect(src).toContain('import { mysqlAdapter } from "edgecms/mysql"');
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: mysqlAdapter })");
  });

  it("imports and passes project plugins when a plugins module is present", () => {
    const src = generateEntrySource("./config.generated.mjs", "d1", "./plugins.generated.mjs");
    expect(src).toContain('import plugins from "./plugins.generated.mjs"');
    expect(src).toContain("createApp(resolved, snapshot, { plugins })");
  });

  it("passes both the adapter factory and plugins together", () => {
    const src = generateEntrySource("./config.generated.mjs", "postgres", "./plugins.generated.mjs");
    expect(src).toContain("createApp(resolved, snapshot, { databaseAdapter: postgresAdapter, plugins })");
  });
});
