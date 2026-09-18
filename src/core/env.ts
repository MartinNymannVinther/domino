import { z } from "zod";
import { MISTRAL_EU_BASE_URL } from "@/core/llm/mistral";

/**
 * These URLs are built in docker-compose.yml by pasting a password into
 * `postgres://user:PASSWORD@db:5432/domino`, so a password containing a
 * slash ends the authority part of the URL and the rest becomes
 * nonsense. `openssl rand -base64` emits `/`, `+` and `=`, which is why
 * the deploy guide asks for hex here. Without this hint the error names
 * the URL, and the person who has to fix it set a password.
 */
const DB_URL_HINT =
  "must be a valid postgres:// URL. If you generated the password with `openssl rand -base64`, " +
  "a `/`, `+` or `=` in it breaks the URL: use `openssl rand -hex 24` instead.";

/** The value shipped in .env.example. Refused in production, by name. */
const PLACEHOLDER_SECRET = "dev-only-secret-change-me-in-production";

/**
 * Server-side environment variables, validated at the boundary.
 * Import this instead of reading process.env directly.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_DATABASE_URL: z.url({ error: DB_URL_HINT }),
    AUTH_DATABASE_URL: z.url({ error: DB_URL_HINT }),
    BETTER_AUTH_SECRET: z.string().min(16),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    // Other origins the browser may sign in from, comma-separated: a
    // machine's network name while developing, a second hostname in
    // front of one installation. Better Auth refuses every origin it
    // was not told about, which is right, and which is why this exists
    // rather than a wildcard. Passkeys stay bound to BETTER_AUTH_URL.
    AUTH_TRUSTED_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).max(20)),
    // LLM adapter (CLAUDE.md: EU-hosted or local models behind an
    // adapter): "mistral" (EU-hosted API), "ollama" (local or
    // self-hosted, Ollama-compatible) or "none" to disable AI features.
    LLM_PROVIDER: z.enum(["mistral", "ollama", "none"]).default("none"),
    // Secret. Lives only in .env locally and in Coolify in production.
    MISTRAL_API_KEY: z.string().min(1).optional(),
    // Model override; sensible per-provider defaults apply when unset.
    LLM_MODEL: z.string().min(1).optional(),
    OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
    // Which Mistral endpoint to call. Defaults to the EU one, which is
    // what dogma four and docs/subprocessors.md commit this installation
    // to; api.mistral.ai carries no location commitment at all. Like the
    // Ollama address this belongs to the installation, so a workspace
    // cannot move where its project text is processed.
    MISTRAL_BASE_URL: z.url().default(MISTRAL_EU_BASE_URL),
    // Who may create an account: "closed" (the default) admits nobody once
    // the first user exists, "open" lets anyone register. See
    // src/core/auth/signup.ts.
    SIGNUP: z.enum(["closed", "open"]).default("closed"),
    // A demo workspace per visitor, seeded and thrown away after a day.
    // Off by default: an installation running real work should not hand
    // out accounts, and the route answers 404 while this is "off".
    DEMO: z.enum(["off", "on"]).default("off"),
    // The whole installation's ceiling on model calls in any 24 hours,
    // counted across every workspace (src/modules/ai/limits.ts, ADR 0035).
    // The ceilings per user and per workspace are counted inside a tenant
    // context and so cannot see each other; this is the one that can. The
    // default is roughly three workspaces running flat out, which no real
    // team approaches and a script reaches in an afternoon. 0 turns the
    // installation ceiling off — the honest setting for a self-hoster
    // whose model runs on their own machine and costs nothing per call;
    // the per-user and per-workspace ceilings stand either way.
    AI_DAILY_CALL_CAP: z.coerce.number().int().min(0).max(1_000_000).default(2000),
    // Whether this process runs queued flows. "on" (the default) is the
    // one-server installation; "off" is for a deployment that runs a
    // second process for the runner and keeps the web one answering.
    RUNNER: z.enum(["on", "off"]).default("on"),
    // How many proxies in front of Domino append to X-Forwarded-For. The
    // rightmost entries are the ones your own infrastructure wrote and are
    // therefore the only ones worth trusting; everything to the left of
    // them was supplied by the caller. Coolify/Traefik is one hop, which
    // is the default. See src/core/rate-limit.ts.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(1),
  })
  .superRefine((value, ctx) => {
    // `next build` runs with NODE_ENV=production and placeholder values
    // for everything it must import, because a build has no database and
    // no secrets. It is not an installation, so it is not held to an
    // installation's standards; the checks below are for a process that
    // is about to serve requests.
    const building = process.env.NEXT_PHASE === "phase-production-build";
    // The placeholder is published in .env.example, and this secret does
    // not only sign sessions: it derives the key that encrypts every
    // workspace's model API key (src/core/crypto/secret-box.ts). An
    // installation that went live on the example value would be handing
    // both away. Documentation is not a control, so this is one.
    if (value.NODE_ENV === "production" && !building) {
      // Coolify pre-fills every variable with the compose file's `:?`
      // message as its value, so "set BETTER_AUTH_SECRET" arrives here
      // looking like a choice. It is short enough to fail the length rule
      // too, but the length rule's message would send the operator to the
      // wrong fix.
      if (/^\s*set\s+[A-Z][A-Z0-9_]*\b/.test(value.BETTER_AUTH_SECRET)) {
        ctx.addIssue({
          code: "custom",
          message:
            "BETTER_AUTH_SECRET holds the compose file's placeholder text, not a secret. Coolify fills every variable with the message after `:?` in docker-compose.yml; replace it with `openssl rand -base64 32`, and check the database passwords the same way.",
          path: ["BETTER_AUTH_SECRET"],
        });
      } else if (
        value.BETTER_AUTH_SECRET === PLACEHOLDER_SECRET ||
        value.BETTER_AUTH_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "BETTER_AUTH_SECRET must be at least 32 characters and not the value from .env.example in production. Generate one with: openssl rand -base64 32",
          path: ["BETTER_AUTH_SECRET"],
        });
      }
      if (!value.BETTER_AUTH_URL.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          message:
            "BETTER_AUTH_URL must be an https:// address in production; passkeys and secure cookies are bound to it",
          path: ["BETTER_AUTH_URL"],
        });
      }
    }
    if (value.LLM_PROVIDER === "mistral" && !value.MISTRAL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "LLM_PROVIDER=mistral requires MISTRAL_API_KEY",
        path: ["LLM_PROVIDER"],
      });
    }
  });

/**
 * An empty string means "not set".
 *
 * docker-compose.yml forwards every optional variable as `${VAR:-}`,
 * which hands the container an empty string when the operator left it
 * blank. Without this, `SIGNUP=""` would fail an enum that has a perfectly
 * good default, and the installation would refuse to start over a setting
 * nobody chose. Nothing in this schema gives an empty string a meaning of
 * its own, so dropping the key is the same as never sending it.
 */
function present(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => typeof value === "string" && value !== ""),
  ) as Record<string, string>;
}

export const env = EnvSchema.parse(present(process.env));
