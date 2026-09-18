import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

/**
 * The Postgres image runs docker/postgres-init/01-roles.sh once, on an
 * empty data directory, and nothing else ever runs it: not the app, not
 * the migrations, not ensure-roles (which skips when no role passwords
 * are in the environment, as on a checkout). A bug in it shows up as a
 * database container that "exited (3)" on the first `docker compose up`
 * of a fresh clone, and nowhere else — which is how one shipped.
 *
 * So the script is run here, for real, through the same psql the image
 * uses, against the test database and with the passwords the rest of the
 * suite already logs in with. That exercises the ALTER path; the CREATE
 * path is the same statement with one word changed. Skipped where psql
 * is not on the PATH, and says so.
 */

const SCRIPT = fileURLToPath(new URL("../../docker/postgres-init/01-roles.sh", import.meta.url));

function requireUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return new URL(value);
}

const psqlOnPath = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!psqlOnPath)("docker/postgres-init/01-roles.sh", () => {
  it("runs to completion and leaves both runtime roles able to log in", async () => {
    const migration = requireUrl("MIGRATION_DATABASE_URL");
    const app = requireUrl("APP_DATABASE_URL");
    const auth = requireUrl("AUTH_DATABASE_URL");

    const result = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env,
        // What the image gives the script, and what libpq reads for the rest.
        POSTGRES_USER: decodeURIComponent(migration.username),
        POSTGRES_DB: migration.pathname.replace(/^\//, ""),
        PGHOST: migration.hostname,
        PGPORT: migration.port || "5432",
        PGPASSWORD: decodeURIComponent(migration.password),
        DOMINO_APP_PASSWORD: decodeURIComponent(app.password),
        DOMINO_AUTH_PASSWORD: decodeURIComponent(auth.password),
      },
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout.match(/(CREATE|ALTER) ROLE/g)).toHaveLength(2);

    // Proven by using them: a role has the right password only if it can log in.
    for (const [url, expected] of [
      [app, "domino_app"],
      [auth, "domino_auth"],
    ] as const) {
      const client = new Client({ connectionString: url.toString() });
      await client.connect();
      const { rows } = await client.query<{ me: string }>("select current_user as me");
      await client.end();
      expect(rows[0]?.me).toBe(expected);
    }
  });
});
