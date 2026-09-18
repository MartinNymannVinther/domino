/**
 * Which Domino is running.
 *
 * The values come from `env` in next.config.ts, which means they are
 * inlined into the bundle when the app is built. That is deliberate: a
 * running container has no git checkout and no package.json to read, and a
 * version the app has to look up at runtime is a version that can be wrong.
 *
 * Written as literal `process.env.X` reads because that is what Next
 * replaces at build time; destructuring or dynamic lookup would leave them
 * undefined in production. The fallbacks are what tests and any other
 * runtime outside a Next build see.
 */

export type BuildInfo = {
  /** Semver from package.json, raised by hand when a step is worth naming. */
  version: string;
  /** Short commit of the code that was built, or "unknown". */
  commit: string;
  /** The build read a working tree with uncommitted changes. Dev only. */
  dirty: boolean;
  /** ISO timestamp of the build, or of dev-server start. */
  builtAt: string;
  /** What the app calls itself: "0.1.0+a1b2c3d". */
  release: string;
  /** Last migration in the checked-in journal the build was made from. */
  migration: string;
  /** How many migrations that journal holds. */
  migrationCount: number;
};

export function formatRelease(version: string, commit: string): string {
  return commit && commit !== "unknown" ? `${version}+${commit}` : version;
}

const version = process.env.DOMINO_VERSION || "0.0.0";
const commit = process.env.DOMINO_COMMIT || "unknown";

export const buildInfo: BuildInfo = {
  version,
  commit,
  dirty: process.env.DOMINO_DIRTY === "1",
  builtAt: process.env.DOMINO_BUILT_AT || "",
  release: formatRelease(version, commit),
  migration: process.env.DOMINO_MIGRATION || "unknown",
  migrationCount: Number(process.env.DOMINO_MIGRATION_COUNT || "0"),
};
