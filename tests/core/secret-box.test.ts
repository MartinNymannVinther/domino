import { describe, expect, it } from "vitest";
import { openSecret, sealSecret, secretHint } from "@/core/crypto/secret-box";

/**
 * The box that holds a workspace's model key. Three claims worth proving:
 * a sealed value comes back, a tampered one does not come back at all
 * rather than coming back wrong, and anything unreadable reads as absent
 * so an installation survives a rotated auth secret. A fourth since the
 * pre-release review: a value sealed for one workspace does not open for
 * another, so the column cannot be moved between rows.
 */
const ORG = "org_aaaaaaaaaaaaaaaa";
const OTHER_ORG = "org_bbbbbbbbbbbbbbbb";

describe("secret box", () => {
  it("returns what was sealed", () => {
    const sealed = sealSecret("sk-test-abcdef123456", ORG);
    expect(sealed).not.toContain("sk-test");
    expect(openSecret(sealed, ORG)).toBe("sk-test-abcdef123456");
  });

  it("gives a different ciphertext every time, so equal keys do not look equal", () => {
    expect(sealSecret("same", ORG)).not.toBe(sealSecret("same", ORG));
  });

  it("refuses a tampered ciphertext instead of returning something wrong", () => {
    const parts = sealSecret("sk-test-abcdef123456", ORG).split(".");
    const flipped = Buffer.from(parts[3]!, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(
      openSecret([parts[0], parts[1], parts[2], flipped.toString("base64url")].join("."), ORG),
    ).toBe(null);
  });

  it("treats nonsense, an unknown version and nothing at all as no key", () => {
    expect(openSecret(null, ORG)).toBe(null);
    expect(openSecret("", ORG)).toBe(null);
    expect(openSecret("not-a-sealed-value", ORG)).toBe(null);
    expect(openSecret(`v3.${"a".repeat(16)}.${"b".repeat(22)}.${"c".repeat(8)}`, ORG)).toBe(null);
  });

  it("does not open for another workspace than the one it was sealed for", () => {
    const sealed = sealSecret("sk-test-abcdef123456", ORG);
    expect(openSecret(sealed, OTHER_ORG)).toBe(null);
    expect(openSecret(sealed, ORG)).toBe("sk-test-abcdef123456");
  });

  it("hints at a key without showing it", () => {
    expect(secretHint("sk-abcdefgh1234")).toBe("····1234");
    expect(secretHint("ab")).toBe("····");
  });
});
