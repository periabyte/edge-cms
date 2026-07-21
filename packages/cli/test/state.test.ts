import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyState, lastSnapshot, readState, writeState } from "../src/state.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "edgecms-state-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("state.json", () => {
  it("returns empty state when no file exists yet", async () => {
    expect(await readState(dir)).toEqual(emptyState());
  });

  it("round-trips through write and read", async () => {
    const state = {
      version: 1 as const,
      resources: { d1: { id: "abc", name: "db" } },
      schema: { snapshotVersion: 1 as const, collections: [] },
      migrations: [{ id: "m1", checksum: "deadbeef", appliedAt: 1234 }],
    };
    await writeState(dir, state);
    expect(await readState(dir)).toEqual(state);
  });

  it("lastSnapshot returns null before any migration has been applied", () => {
    expect(lastSnapshot(emptyState())).toBeNull();
  });

  it("lastSnapshot extracts the snapshot shape from state", () => {
    const state = {
      version: 1 as const,
      resources: {},
      schema: { snapshotVersion: 1 as const, collections: [{ name: "posts", fields: [], versioning: false, locales: [] }] },
      migrations: [],
    };
    expect(lastSnapshot(state)).toEqual({ snapshotVersion: 1, collections: state.schema.collections });
  });
});
