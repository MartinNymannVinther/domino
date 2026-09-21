import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/**
 * The build stamp. Resolved once when this config is evaluated - at
 * `next build` for a deployed image, at dev-server start locally - and
 * inlined into the bundle through `env`, so a running Domino can state
 * exactly which code it is without reading anything at runtime.
 *
 * The container build has no `.git` (.dockerignore excludes it), so the
 * build passes DOMINO_COMMIT and DOMINO_BUILT_AT in as build arguments; git
 * is only the local fallback. Everything is a string: `env` inlines literals.
 */
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{ tag: string }>;
};

const passedCommit = process.env.DOMINO_COMMIT?.trim() ?? "";
const commit = passedCommit || git("rev-parse", "--short=7", "HEAD") || "unknown";
// Only meaningful when we read the working tree ourselves; a commit handed
// to us by the build has no working tree to be dirty. Tracked files only
// (-uno): an untracked patch file or scratch note lying in the repo is not
// code that runs, and warning about it trains you to ignore the warning.
const dirty = !passedCommit && git("status", "--porcelain", "-uno") !== "" ? "1" : "";
const builtAt = process.env.DOMINO_BUILT_AT?.trim() || new Date().toISOString();
const migration = journal.entries.at(-1)?.tag ?? "unknown";

/**
 * The content policy.
 *
 * Domino is in a good position to have a strict one: nothing in the app
 * renders HTML it did not write (`dangerouslySetInnerHTML` appears
 * nowhere), and no script, style, image or font is loaded from another
 * host - the two typefaces are files in `public/fonts`. So everything is
 * 'self', and the two exceptions are named rather than assumed:
 *
 * - script-src keeps 'unsafe-inline' because Next.js writes its own
 *   bootstrap script inline and next-themes writes the one that sets the
 *   theme before the first paint. Removing it means a per-request nonce,
 *   which in turn means every page renders dynamically — a real trade
 *   with a real cost, and one that deserves its own change rather than a
 *   line in a hardening pass. What is here already stops a script being
 *   loaded from anywhere else, which is the vector that matters.
 * - style-src keeps it because next-themes and Base UI both inject style
 *   elements. An inline style is a far smaller thing than an inline script.
 *
 * img-src allows data: for the TOTP enrolment QR code, which is drawn to
 * a data URL, and blob: for PDFs opened in a tab.
 *
 * Three directives are relaxed outside production, and all three are
 * about `next dev` on http://localhost rather than about the policy:
 *
 * - 'unsafe-eval', because React's development build rebuilds stack
 *   traces with eval(). The production bundle does not.
 * - ws: on connect-src, for the hot-reload socket. 'self' is an origin,
 *   and ws://localhost is a different scheme from http://localhost, so
 *   it does not match — Chrome allows it anyway, Safari does not.
 * - upgrade-insecure-requests is left out entirely. The spec exempts
 *   loopback; WebKit does not implement that exemption, so in Safari on
 *   http://localhost every stylesheet and script is rewritten to https,
 *   nothing answers, and the page renders as bare HTML. Chrome does
 *   exempt it, which is exactly why testing in one browser was not
 *   enough. In production everything is https already and HSTS is doing
 *   this job properly.
 */
/**
 * Built as a function of one flag rather than read from the environment,
 * so the production policy is something a test can assert instead of
 * infer. The relaxations above are all it differs by.
 */
export function contentSecurityPolicy(production: boolean): string {
  return [
    "default-src 'self'",
    production
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    production ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * Hardening on every response. X-Frame-Options is DENY across the board:
 * nothing Domino serves is meant to be framed by anyone, itself included. A
 * document rendered for reading inside its own pages would get SAMEORIGIN
 * on its own path, and only that.
 *
 * Permissions-Policy names the two WebAuthn permissions as `self` on
 * purpose. Passkeys are how people sign in here, and a later blanket deny
 * added to that list would switch off the login without saying so.
 *
 * HSTS is production-only. A browser that is told localhost speaks HTTPS
 * believes it for two years, and no developer should have to find that
 * out by having their machine break.
 */
export function securityHeaders(production: boolean): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(production) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()",
        "publickey-credentials-get=(self)",
        "publickey-credentials-create=(self)",
      ].join(", "),
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The text extractors run in Node as they are, not bundled: bundled,
  // pdf.js resolves to its browser build and dies on the first PDF with
  // "DOMMatrix is not defined" — in the production image only, since
  // `next dev` does not bundle them. Left external, the standalone
  // output traces the packages in whole and the Node entry is used.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // pdf.js loads its worker by path at run time, which the file tracer
  // cannot see; named here, the file is carried into the standalone
  // output. Files only: the tracer refuses a glob that lands on a
  // symlinked directory, of which pnpm's tree is made.
  outputFileTracingIncludes: {
    "/api/files": ["./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/*.mjs"],
  },
  env: {
    DOMINO_VERSION: pkg.version,
    DOMINO_COMMIT: commit,
    DOMINO_DIRTY: dirty,
    DOMINO_BUILT_AT: builtAt,
    DOMINO_MIGRATION: migration,
    DOMINO_MIGRATION_COUNT: String(journal.entries.length),
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders(process.env.NODE_ENV === "production") },
      // The typefaces are served from `public`, which Next answers with
      // `max-age=0` - a revalidation round trip before the first glyph on
      // every visit. They used to sit under a content-hashed /_next/static
      // URL and be cached for a year, and nothing about them changed, so
      // say so. The file name is the contract: a replaced face gets a new
      // name rather than the same one with new bytes.
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
