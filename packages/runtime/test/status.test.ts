import { describe, expect, it } from "vitest";
import { computeStatus, serializeDoc, serializePage } from "../src/status.js";

const NOW = 1_700_000_000_000;

describe("computeStatus", () => {
  it("is draft when published_at is null", () => {
    expect(computeStatus({ published_at: null }, NOW)).toBe("draft");
  });

  it("is draft when published_at is absent", () => {
    expect(computeStatus({}, NOW)).toBe("draft");
  });

  it("is published when published_at is in the past", () => {
    expect(computeStatus({ published_at: NOW - 1 }, NOW)).toBe("published");
  });

  it("is published at the exact boundary (published_at === now)", () => {
    expect(computeStatus({ published_at: NOW }, NOW)).toBe("published");
  });

  it("is scheduled when published_at is in the future", () => {
    expect(computeStatus({ published_at: NOW + 1 }, NOW)).toBe("scheduled");
  });
});

describe("serializeDoc / serializePage", () => {
  it("attaches publishStatus without mutating the input", () => {
    const doc = { id: "a", published_at: null };
    const out = serializeDoc(doc, NOW);
    expect(out.publishStatus).toBe("draft");
    expect(doc).not.toHaveProperty("publishStatus");
  });

  it("never clobbers a user-defined `status` content field", () => {
    const doc = { id: "a", status: "archived", published_at: NOW - 1 };
    const out = serializeDoc(doc, NOW);
    expect(out.status).toBe("archived"); // content field preserved
    expect(out.publishStatus).toBe("published"); // publish state is separate
  });

  it("attaches publishStatus to every doc in a page and preserves the cursor", () => {
    const page = {
      docs: [
        { id: "a", published_at: null },
        { id: "b", published_at: NOW - 1 },
        { id: "c", published_at: NOW + 1000 },
      ],
      cursor: "next",
    };
    const out = serializePage(page, NOW);
    expect(out.docs.map((d) => (d as { publishStatus: string }).publishStatus)).toEqual([
      "draft",
      "published",
      "scheduled",
    ]);
    expect(out.cursor).toBe("next");
  });
});
