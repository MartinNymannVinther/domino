import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../next.config";
import { formatRelease } from "../../src/core/version";

/**
 * The build stamp only works because next.config inlines it and
 * src/core/version.ts reads the same names back. Rename one side and
 * nothing breaks in development, where the values are re-resolved on every
 * dev-server start anyway — it breaks in production, where the app quietly
 * starts calling itself 0.0.0. So the contract is pinned here.
 */

const KEYS = [
  "DOMINO_VERSION",
  "DOMINO_COMMIT",
  "DOMINO_DIRTY",
  "DOMINO_BUILT_AT",
  "DOMINO_MIGRATION",
  "DOMINO_MIGRATION_COUNT",
] as const;

describe("build stamp", () => {
  const env = (config.env ?? {}) as Record<string, string | undefined>;

  it("inlines every value the app reads", () => {
    for (const key of KEYS) {
      expect(typeof env[key], key).toBe("string");
    }
  });

  it("carries the version from package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(env.DOMINO_VERSION).toBe(pkg.version);
  });

  it("names a commit and a migration, or says unknown", () => {
    expect(env.DOMINO_COMMIT).toMatch(/^[0-9a-f]{7,40}$|^unknown$/);
    expect(Number(env.DOMINO_MIGRATION_COUNT)).toBeGreaterThan(0);
  });

  it("reads the source module's names, not stale ones", () => {
    const source = readFileSync("src/core/version.ts", "utf8");
    for (const key of KEYS) {
      expect(source, key).toContain(`process.env.${key}`);
    }
  });
});

describe("formatRelease", () => {
  it("joins version and commit", () => {
    expect(formatRelease("0.2.0", "a1b2c3d")).toBe("0.2.0+a1b2c3d");
  });

  it("drops an unknown commit rather than printing it", () => {
    expect(formatRelease("0.2.0", "unknown")).toBe("0.2.0");
    expect(formatRelease("0.2.0", "")).toBe("0.2.0");
  });
});
