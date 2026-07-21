import { describe, expect, it } from "vitest";
import { createInviteToken, verifyInviteToken } from "../src/auth/invite-token.js";

const SECRET = "test-secret-value";

describe("invite tokens", () => {
  it("round-trips a valid token to its user id", async () => {
    const token = await createInviteToken("user-123", SECRET);
    expect(await verifyInviteToken(token, SECRET)).toBe("user-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createInviteToken("user-123", SECRET);
    expect(await verifyInviteToken(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await createInviteToken("user-123", SECRET);
    const [payload, sig] = token.split(".");
    // Flip the payload but keep the old signature.
    const forged = `${payload}x.${sig}`;
    expect(await verifyInviteToken(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = 1_000_000;
    const token = await createInviteToken("user-123", SECRET, now, 1000);
    expect(await verifyInviteToken(token, SECRET, now + 500)).toBe("user-123");
    expect(await verifyInviteToken(token, SECRET, now + 2000)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyInviteToken("not-a-token", SECRET)).toBeNull();
    expect(await verifyInviteToken("", SECRET)).toBeNull();
  });
});
