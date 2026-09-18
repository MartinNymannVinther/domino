import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import config, { contentSecurityPolicy, securityHeaders } from "../../next.config";

/**
 * Every response carries the hardening headers, and nothing Domino serves
 * may be framed - by anyone, itself included. The day a document needs to
 * be shown inside one of our own pages, that path gets SAMEORIGIN and this
 * test learns its name; until then DENY is the only answer.
 *
 * The set is asserted exactly rather than by presence, so a header quietly
 * dropped fails here. Both halves are asserted: the policy is built from a
 * flag rather than read from the environment, so the production one is
 * something this file can check instead of infer.
 */

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

const DEV_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self' ws: wss:; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'";

const PROD_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "upgrade-insecure-requests";

function map(headers: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("applies the hardening rule to every path", async () => {
    const rules = (await config.headers!()) as Rule[];
    expect(rules[0]?.source).toBe("/(.*)");
    // The suite runs outside production, so this is the development set.
    expect(map(rules[0]!.headers)["Content-Security-Policy"]).toBe(DEV_CSP);
    // Every other rule is about caching, and none of them may carry a
    // security header: a narrower source would then override the one above
    // on the paths it matches.
    for (const rule of rules.slice(1)) {
      expect(Object.keys(map(rule.headers))).toEqual(["Cache-Control"]);
    }
  });

  it("caches the typefaces rather than revalidating them every visit", async () => {
    const rules = (await config.headers!()) as Rule[];
    const fonts = rules.find((rule) => rule.source.startsWith("/fonts/"));
    expect(map(fonts!.headers)["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });

  it("sends the full set in production", () => {
    expect(map(securityHeaders(true))).toEqual({
      "Content-Security-Policy": PROD_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    });
  });

  it("keeps HSTS out of development", () => {
    // A browser told that localhost speaks HTTPS believes it for two years.
    expect(map(securityHeaders(false))["Strict-Transport-Security"]).toBeUndefined();
    expect(map(securityHeaders(true))["Strict-Transport-Security"]).toBeTruthy();
  });

  /**
   * This one is here because it already went wrong once, and it cost
   * somebody an afternoon of looking at an unstyled page.
   *
   * The policy carried upgrade-insecure-requests unconditionally. The
   * spec says a browser should not apply it to loopback; WebKit applies
   * it anyway, so in Safari on http://localhost every stylesheet and
   * every script was rewritten to https, nothing answered, and the app
   * rendered as bare HTML. Chrome does exempt loopback, which is exactly
   * why checking in one browser proved nothing.
   */
  it("does not upgrade requests outside production, which is where localhost lives", () => {
    expect(contentSecurityPolicy(false)).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy(true)).toContain("upgrade-insecure-requests");
  });

  it("lets the hot-reload socket through outside production", () => {
    // 'self' is an origin, and ws://localhost is a different scheme from
    // http://localhost, so it does not match. Chrome allows it anyway;
    // Safari does not, and the socket is how the page reloads itself.
    expect(contentSecurityPolicy(false)).toContain("connect-src 'self' ws: wss:");
    expect(contentSecurityPolicy(true)).toContain("connect-src 'self';");
  });

  it("allows eval only outside production", () => {
    // React's development build needs it to rebuild stack traces; the
    // production bundle does not, and letting it through there would hand
    // an injected string a way to become code.
    expect(contentSecurityPolicy(false)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(true)).not.toContain("'unsafe-eval'");
  });

  it("does not let a script or a style come from anywhere but us", () => {
    for (const csp of [contentSecurityPolicy(false), contentSecurityPolicy(true)]) {
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("object-src 'none'");
      // 'strict-dynamic' would silently void 'unsafe-inline'. See TECH-DEBT.md.
      expect(csp).not.toContain("strict-dynamic");
      expect(csp).not.toMatch(/script-src[^;]*https?:/);
    }
  });

  it("still names the two permissions passkeys need", () => {
    // A blanket deny added to this list later would switch off the login
    // without saying so, which is why they are written out.
    const policy = map(securityHeaders(true))["Permissions-Policy"]!;
    expect(policy).toContain("publickey-credentials-get=(self)");
    expect(policy).toContain("publickey-credentials-create=(self)");
  });

  it("has not drifted from the file the deployment reads", async () => {
    const source = await readFile(new URL("../../next.config.ts", import.meta.url), "utf8");
    expect(source).toContain('securityHeaders(process.env.NODE_ENV === "production")');
  });
});
