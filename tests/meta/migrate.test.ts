import { describe, expect, it } from "vitest";
import {
  looksLikeComposePlaceholder,
  passwordIn,
  describeTarget,
  explainDatabaseError,
  unencodedPasswordCharacter,
} from "../../scripts/migrate";

/**
 * The migration step must say what went wrong. drizzle-kit's own command
 * swallows every failure, and the first quickstart on a real machine ended
 * in "applying migrations..." and exit code 1 with nothing to go on. These
 * pin the explanations for the failures that actually happen.
 */

const target = "localhost:5432/domino";

describe("explainDatabaseError", () => {
  it("names a server nobody reaches", () => {
    const { headline, hint } = explainDatabaseError({ code: "ECONNREFUSED" }, target);
    expect(headline).toContain("Nothing answers on localhost:5432/domino");
    expect(hint).toContain("--wait");
  });

  it("names a missing database and points at the port clash that causes it", () => {
    const { headline, hint } = explainDatabaseError(
      { code: "3D000", message: 'database "domino" does not exist' },
      target,
    );
    expect(headline).toContain("does not exist");
    expect(hint).toContain("POSTGRES_PORT=5433");
  });

  it("names a refused password", () => {
    expect(explainDatabaseError({ code: "28P01" }, target).headline).toContain("Password refused");
  });

  it("looks through Drizzle's wrapper to the database's own error", () => {
    const wrapped = { message: "Failed query: select 1", cause: { code: "57P03" } };
    expect(explainDatabaseError(wrapped, target).headline).toContain("still starting up");
  });

  it("falls back to the error's own words", () => {
    expect(explainDatabaseError(new Error("syntax error at or near GRANT"), target)).toEqual({
      headline: "syntax error at or near GRANT",
    });
  });
});

describe("describeTarget", () => {
  it("names host, port and database, never the password", () => {
    expect(describeTarget("postgres://postgres:secret@db:5433/domino")).toBe("db:5433/domino");
    expect(describeTarget("postgres://postgres:secret@localhost/domino")).toBe(
      "localhost:5432/domino",
    );
  });
});

describe("a password that ends the URL", () => {
  /**
   * The failure that cost the first Domino deployment a round: db came up
   * healthy, migrate died with exit 1, and the reason was a `/` in a
   * base64 password. The container is unaffected because it receives the
   * password as a plain variable; only the URL breaks, and the URL is
   * what this script dials.
   */
  it("is named, with the character to blame", () => {
    expect(unencodedPasswordCharacter("postgres://postgres:ab/cd@db:5432/domino")).toBe("/");
    expect(unencodedPasswordCharacter("postgres://postgres:ab?cd@db:5432/domino")).toBe("?");
    expect(unencodedPasswordCharacter("postgres://postgres:a@b@db:5432/domino")).toBe("@");
  });

  it("stays quiet about a password that is fine", () => {
    expect(unencodedPasswordCharacter("postgres://postgres:0a1b2c3d4e5f@db:5432/domino")).toBe(
      null,
    );
    // base64 without the dangerous characters is still a valid URL.
    expect(unencodedPasswordCharacter("postgres://postgres:ab+cd=@db:5432/domino")).toBe(null);
  });

  it("does not trip over a URL with no credentials at all", () => {
    expect(unencodedPasswordCharacter("postgres://db:5432/domino")).toBe(null);
    expect(unencodedPasswordCharacter("not-a-url")).toBe(null);
  });
});

/**
 * docker-compose.yml marks every secret `${NAME:?set NAME ...}`. Coolify
 * reads that file to pre-create the resource's variables and fills each
 * one with the text after `:?` as its value, so a stack can come up with
 * every service agreeing that the database password is
 * "set POSTGRES_PASSWORD". It did, on the first deployment; a person
 * reading the variable list caught it. This is the check that does.
 */
describe("the compose file's own placeholder text", () => {
  it("is recognised in every shape the file uses", () => {
    expect(looksLikeComposePlaceholder("set POSTGRES_PASSWORD")).toBe(true);
    expect(looksLikeComposePlaceholder("set BETTER_AUTH_SECRET")).toBe(true);
    expect(looksLikeComposePlaceholder("set BETTER_AUTH_URL, e.g. https://domino.haij.dk")).toBe(
      true,
    );
    expect(looksLikeComposePlaceholder("set POSTGRES_PASSWORD (openssl rand -hex 24)")).toBe(true);
  });

  it("is not confused with a password that merely starts with the word", () => {
    expect(looksLikeComposePlaceholder("settle-the-bill-9f2c")).toBe(false);
    expect(looksLikeComposePlaceholder("set")).toBe(false);
    expect(looksLikeComposePlaceholder("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(
      false,
    );
    expect(looksLikeComposePlaceholder(undefined)).toBe(false);
    expect(looksLikeComposePlaceholder("")).toBe(false);
  });

  it("is found inside the migration URL, where compose put it", () => {
    expect(passwordIn("postgres://postgres:set POSTGRES_PASSWORD@db:5432/domino")).toBe(
      "set POSTGRES_PASSWORD",
    );
    expect(passwordIn("postgres://postgres:a1b2c3@db:5432/domino")).toBe("a1b2c3");
    expect(passwordIn("postgres://db:5432/domino")).toBe(null);
  });
});
