/**
 * The database the test suite is allowed to destroy.
 *
 * The suite drops and recreates the whole schema on every run — that is
 * how a fresh checkout is proven to migrate from zero. Pointed at a
 * development database it also erases the account you log in with and
 * every customer, invoice and hour in it. That happened once; it must not
 * be able to happen again.
 *
 * So the tests never use the URLs from `.env` directly. Each one is
 * rewritten to a sibling database whose name ends in `_test`, and the
 * suite refuses to start if the result is anything else. The dev database
 * is not merely avoided by convention — it is unreachable from here.
 */

const SUFFIX = "_test";

const BASE_VARS = ["MIGRATION_DATABASE_URL", "APP_DATABASE_URL", "AUTH_DATABASE_URL"] as const;

export type DatabaseVar = (typeof BASE_VARS)[number];

function testDatabaseName(name: string): string {
  return name.endsWith(SUFFIX) ? name : `${name}${SUFFIX}`;
}

function rewrite(url: string, source: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${source} is not a valid connection URL`);
  }
  const name = parsed.pathname.replace(/^\//, "");
  if (!name) throw new Error(`${source} names no database`);
  parsed.pathname = `/${testDatabaseName(name)}`;
  return parsed.toString();
}

/**
 * Resolves the three connection URLs the suite runs against. An explicit
 * `TEST_<VAR>` wins, so a separate server can be used; otherwise the
 * ordinary URL is reused with `_test` appended to the database name.
 */
export function resolveTestDatabaseUrls(
  env: Record<string, string | undefined> = process.env,
): Record<DatabaseVar, string> {
  const resolved = {} as Record<DatabaseVar, string>;

  for (const name of BASE_VARS) {
    const override = env[`TEST_${name}`];
    const base = env[name];
    const url = override ?? (base ? rewrite(base, name) : undefined);
    if (!url) {
      throw new Error(
        `Neither TEST_${name} nor ${name} is set. The test suite needs a database it may erase.`,
      );
    }

    // The guard, not a formality: everything above is convenience, this
    // is what stands between a test run and somebody's real data.
    const dbName = new URL(url).pathname.replace(/^\//, "");
    if (!dbName.endsWith(SUFFIX)) {
      throw new Error(
        `Refusing to run: TEST_${name} points at "${dbName}", which is not a test database. ` +
          `The suite drops the entire schema, so its database name must end in "${SUFFIX}".`,
      );
    }
    // An explicit override aimed at the working database is the one
    // mistake the suffix rule cannot catch on its own.
    if (override && base && override === base) {
      throw new Error(`Refusing to run: TEST_${name} is the same database as ${name}.`);
    }

    resolved[name] = url;
  }

  return resolved;
}

/** The maintenance connection used to create the test database if missing. */
export function maintenanceUrl(migrationUrl: string): string {
  const parsed = new URL(migrationUrl);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}
