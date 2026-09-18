import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { countUsers, signupAllowedFor } from "@/core/auth/signup";
import { EnvSchema } from "@/core/env";
import { adminPool } from "../helpers/db";

/**
 * Registration is closed on an installation that already has a user.
 *
 * This is the gate between an Domino on the open internet and a stranger
 * creating themselves an organization inside it, so three separate things
 * are pinned: the shipped default is the safe one, the rule admits exactly
 * the first account, and the registration path actually asks.
 *
 * The suite itself runs with SIGNUP=open (see vitest.config.mts) because
 * every other fixture registers users, which is why the closed path is
 * driven through the gate rather than through the environment.
 */

const REQUIRED = {
  APP_DATABASE_URL: "postgres://app:app@localhost:5432/domino",
  AUTH_DATABASE_URL: "postgres://auth:auth@localhost:5432/domino",
  // Deliberately low-entropy and self-describing: a random-looking string
  // here is indistinguishable from a real key to a secrets scanner, and a
  // test fixture is not worth teaching anyone to ignore that alarm.
  BETTER_AUTH_SECRET: "not-a-real-secret-for-tests-only",
};

let admin: Pool;

beforeAll(async () => {
  admin = adminPool();
  await admin.query(
    `insert into users (id, name, email, email_verified)
     values ('user_signup_gate', 'Gate Seed', 'gate-seed@example.com', false)
     on conflict (id) do nothing`,
  );
});

afterAll(async () => {
  await admin?.end();
});

describe("the shipped default", () => {
  it("is closed, so an installation is never open by forgetting", () => {
    expect(EnvSchema.parse(REQUIRED).SIGNUP).toBe("closed");
  });
});

describe("the first user, and nobody after", () => {
  it("lets the first account through and closes behind it", () => {
    expect(signupAllowedFor("closed", 0)).toBe(true);
    expect(signupAllowedFor("closed", 1)).toBe(false);
    expect(signupAllowedFor("closed", 42)).toBe(false);
  });

  it("admits anyone when deliberately opened", () => {
    expect(signupAllowedFor("open", 0)).toBe(true);
    expect(signupAllowedFor("open", 42)).toBe(true);
  });

  it("counts the users that exist", async () => {
    expect(await countUsers()).toBeGreaterThan(0);
  });
});

describe("registration asks the gate", () => {
  it("is refused and creates nothing when the gate says no", async () => {
    vi.doMock("@/core/auth/signup", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/core/auth/signup")>()),
      signupAllowed: async () => false,
    }));
    vi.resetModules();
    const { registerUserWithOrganization } = await import("@/core/auth/register");

    const email = "gate-applicant@example.com";
    const result = await registerUserWithOrganization(new Headers(), {
      name: "Uindbudt Gæst",
      email,
      password: "en-meget-lang-kode-123",
      organizationName: "Uindbudt ApS",
    });

    expect(result).toEqual({ ok: false, error: "closed" });

    const user = await admin.query("select id from users where email = $1", [email]);
    expect(user.rowCount).toBe(0);

    vi.doUnmock("@/core/auth/signup");
    vi.resetModules();
  });
});
