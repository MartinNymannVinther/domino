// A checkout keeps its database URL in .env; a deployment has it in the
// environment already, and a missing file is silently fine.
import "dotenv/config";
import { Client } from "pg";
import { looksLikeComposePlaceholder } from "./migrate";

/**
 * Give the two runtime database roles their login rights and passwords.
 *
 * This used to live only in `docker/postgres-init/01-roles.sh`, which the
 * Postgres image runs once when the data directory is empty. That works
 * from a checkout and fails on a real deployment: the init directory is
 * bind-mounted from the repository, and a build system that removes its
 * working copy after building leaves the container mounting an empty
 * directory. The script never runs, the migrations create the roles as
 * NOLOGIN (the safe default), and the application is refused by its own
 * database with nothing in any log to say why. That is exactly what
 * happened on the first deployment.
 *
 * So role provisioning belongs with the migrations, which already run as
 * the owner and already run on every deploy. Idempotent by construction:
 * it sets the state it wants rather than assuming what it finds.
 *
 * Passwords are quoted by Postgres itself through `format(%I, %L)` rather
 * than by string concatenation here. DDL cannot take bind parameters, and
 * a password containing a quote would otherwise be an injection.
 */

const ROLES = ["domino_app", "domino_auth"] as const;

const PASSWORD_ENV: Record<(typeof ROLES)[number], string> = {
  domino_app: "DOMINO_APP_PASSWORD",
  domino_auth: "DOMINO_AUTH_PASSWORD",
};

export async function ensureRole(client: Client, role: string, password: string): Promise<void> {
  const exists = await client.query("select 1 from pg_roles where rolname = $1", [role]);
  const template = exists.rowCount
    ? "select format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) as sql"
    : "select format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) as sql";
  const { rows } = await client.query<{ sql: string }>(template, [role, password]);
  await client.query(rows[0]!.sql);
}

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");

  const missing = ROLES.filter((role) => !process.env[PASSWORD_ENV[role]]);
  if (missing.length === ROLES.length) {
    // A plain `docker compose up` from a checkout still gets its roles from
    // the Postgres init script's defaults. Nothing to do, and nothing worth
    // failing a deployment over.
    console.log("ensure-roles: no role passwords in the environment, skipping");
    return;
  }
  if (missing.length > 0) {
    throw new Error(`ensure-roles: missing ${missing.map((r) => PASSWORD_ENV[r]).join(", ")}`);
  }
  // Coolify pre-fills each variable with the compose file's `:?` message
  // as its value. A role whose password is "set DOMINO_APP_PASSWORD" is a
  // role anyone who has read the repository can log in as.
  const placeholder = ROLES.filter((role) =>
    looksLikeComposePlaceholder(process.env[PASSWORD_ENV[role]]),
  );
  if (placeholder.length > 0) {
    throw new Error(
      `ensure-roles: ${placeholder.map((r) => PASSWORD_ENV[r]).join(" and ")} still hold the ` +
        "compose file's placeholder text rather than a password. Replace them with generated " +
        "values (docs/deploy.md) before deploying again.",
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const role of ROLES) {
      await ensureRole(client, role, process.env[PASSWORD_ENV[role]]!);
      console.log(`ensure-roles: ${role} can log in`);
    }
  } finally {
    await client.end();
  }
}

// Only run when invoked directly, so the tests can import ensureRole.
if (process.argv[1]?.endsWith("ensure-roles.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
