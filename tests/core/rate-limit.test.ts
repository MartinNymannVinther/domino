import { beforeEach, describe, expect, it } from "vitest";
import { callerKey, rateLimit, resetRateLimits } from "@/core/rate-limit";

/**
 * The limiter guarding the public endpoints. It is in memory on purpose;
 * these tests pin the behaviour that decision rests on, so replacing it
 * with a shared store later is a swap rather than a rewrite.
 */

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit and refuses the one after", () => {
    for (let i = 0; i < 5; i++) expect(rateLimit("a", 5, 60_000).allowed).toBe(true);
    const refused = rateLimit("a", 5, 60_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key on its own", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    expect(rateLimit("b", 5, 60_000).allowed).toBe(true);
  });

  it("forgets a key once its window has passed", async () => {
    expect(rateLimit("c", 1, 20).allowed).toBe(true);
    expect(rateLimit("c", 1, 20).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rateLimit("c", 1, 20).allowed).toBe(true);
  });
});

describe("callerKey", () => {
  /**
   * Read from the right, not the left. X-Forwarded-For is a list a proxy
   * appends to, so the leftmost entry is whatever the caller sent. This
   * test used to assert the opposite, and while it did, one header on
   * one curl bought a fresh bucket on every request and every limit in
   * the app was decoration.
   */
  it("reads the address our own proxy appended, not the one the caller sent", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" });
    expect(callerKey(headers, "share")).toBe("share:203.0.113.7");
  });

  it("is not fooled by a caller who supplies a whole chain of their own", () => {
    const forged = new Headers({
      "x-forwarded-for": "9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7",
    });
    // The last entry is the one Traefik wrote; everything before it is
    // the caller's fiction, and changing it must not change the bucket.
    expect(callerKey(forged, "share")).toBe("share:203.0.113.7");
  });

  it("takes a single entry as the proxy's own", () => {
    expect(callerKey(new Headers({ "x-forwarded-for": "203.0.113.7" }), "share")).toBe(
      "share:203.0.113.7",
    );
  });

  it("falls back to x-real-ip, and then to one shared bucket", () => {
    expect(callerKey(new Headers({ "x-real-ip": "203.0.113.9" }), "share")).toBe(
      "share:203.0.113.9",
    );
    // No header at all: everyone shares a bucket, which fails closed.
    expect(callerKey(new Headers(), "share")).toBe("share:unknown");
  });
});
