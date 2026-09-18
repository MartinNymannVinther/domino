import { describe, expect, it } from "vitest";
import { EnvSchema } from "@/core/env";

/**
 * The environment is the boundary an operator crosses on launch day, and
 * the errors it gives are the only help they get at that moment. These
 * pin the two guards and the one hint that exist because getting them
 * wrong is quiet rather than loud.
 */

const REQUIRED = {
  APP_DATABASE_URL: "postgres://app:app@localhost:5432/domino",
  AUTH_DATABASE_URL: "postgres://auth:auth@localhost:5432/domino",
  BETTER_AUTH_SECRET: "not-a-real-secret-for-tests-only",
};

function failure(env: Record<string, string>): string {
  const result = EnvSchema.safeParse(env);
  expect(result.success).toBe(false);
  return result.success ? "" : JSON.stringify(result.error.issues);
}

describe("the database URLs", () => {
  /**
   * docker-compose.yml builds these by pasting a password into
   * postgres://user:PASSWORD@db:5432/domino. `openssl rand -base64` emits
   * `/`, `+` and `=`, and a slash ends the authority part of a URL. The
   * deploy guide asked for base64 until the pre-release review, so this
   * was a real trap: the app refuses to start, the message names
   * APP_DATABASE_URL, and the thing that is wrong is a password.
   */
  it("say what to do when a base64 password broke the URL", () => {
    const broken = failure({
      ...REQUIRED,
      APP_DATABASE_URL: "postgres://domino_app:ab/cd+ef=@db:5432/domino",
    });
    expect(broken).toContain("openssl rand -hex 24");
  });

  it("accept a hex password, which is what the guide now asks for", () => {
    expect(
      EnvSchema.safeParse({
        ...REQUIRED,
        APP_DATABASE_URL: `postgres://domino_app:${"a1b2c3".repeat(8)}@db:5432/domino`,
      }).success,
    ).toBe(true);
  });
});

describe("in production", () => {
  const PROD = { ...REQUIRED, NODE_ENV: "production", BETTER_AUTH_URL: "https://domino.haij.dk" };
  const STRONG = "P4ssPhraseLongEnoughForProductionUse0123456789";

  it("refuses the secret published in .env.example", () => {
    // It is in the repository. It also derives the key that encrypts every
    // workspace's model API key, so an installation running on it is
    // handing both away.
    expect(
      failure({ ...PROD, BETTER_AUTH_SECRET: "dev-only-secret-change-me-in-production" }),
    ).toContain("BETTER_AUTH_SECRET");
  });

  it("names Coolify's placeholder for what it is, rather than calling it short", () => {
    // Coolify fills every variable with the compose file's `:?` message.
    // "set BETTER_AUTH_SECRET" is short too, but the length rule's message
    // would send the operator to generate a longer one and stop there.
    const said = failure({ ...PROD, BETTER_AUTH_SECRET: "set BETTER_AUTH_SECRET" });
    expect(said).toContain("placeholder text");
    expect(said).toContain("docker-compose.yml");
    expect(said).not.toContain("at least 32 characters");
  });

  it("refuses a secret that is merely short", () => {
    expect(failure({ ...PROD, BETTER_AUTH_SECRET: "sixteen-chars-ok" })).toContain(
      "at least 32 characters",
    );
  });

  it("refuses a public URL that is not https", () => {
    expect(
      failure({ ...PROD, BETTER_AUTH_SECRET: STRONG, BETTER_AUTH_URL: "http://domino.haij.dk" }),
    ).toContain("https");
  });

  it("accepts a properly generated pair", () => {
    expect(EnvSchema.safeParse({ ...PROD, BETTER_AUTH_SECRET: STRONG }).success).toBe(true);
  });

  it("holds development to none of it, so localhost still works", () => {
    expect(
      EnvSchema.safeParse({
        ...REQUIRED,
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "dev-only-secret-change-me-in-production",
        BETTER_AUTH_URL: "http://localhost:3000",
      }).success,
    ).toBe(true);
  });
});

describe("a variable forwarded but left blank", () => {
  /**
   * docker-compose.yml forwards every optional setting as `${VAR:-}`,
   * because a variable set in Coolify reaches the compose file but not
   * the container unless it is named there. That forwarding hands the
   * container an empty string for anything the operator left blank, so
   * an empty string has to mean "not set" or the installation would
   * refuse to start over a setting nobody chose.
   */
  it("is the same as no variable at all", () => {
    const before = { ...process.env };
    try {
      Object.assign(process.env, { ...REQUIRED, SIGNUP: "", DEMO: "", MISTRAL_API_KEY: "" });
      // Re-read through the same filter the module applies at import.
      const present = Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => typeof v === "string" && v !== ""),
      );
      const parsed = EnvSchema.parse(present);
      expect(parsed.SIGNUP).toBe("closed");
      expect(parsed.DEMO).toBe("off");
      expect(parsed.MISTRAL_API_KEY).toBeUndefined();
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
      Object.assign(process.env, before);
    }
  });

  it("would otherwise have failed the enum it has a default for", () => {
    // The shape of the bug this guards: "" is not a member of the enum.
    expect(EnvSchema.safeParse({ ...REQUIRED, SIGNUP: "" }).success).toBe(false);
  });
});
