// A checkout keeps its database URL in .env; a deployment has it in the
// environment already, and a missing file is silently fine.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/**
 * Applies the checked-in migrations, and says what went wrong when it
 * cannot.
 *
 * `drizzle-kit migrate` does the same job and swallows every failure: a
 * database that does not exist, a port nobody listens on and a wrong
 * password all end in "applying migrations..." followed by exit code 1
 * and not one word more. The first person to run the quickstart hit
 * exactly that. So the migration step is ours: the same migrator the test
 * suite uses, wrapped in a connection check that names the cause.
 */

export type Explanation = { headline: string; hint?: string };

/** Turns a `pg` error into something a person can act on. */
export function explainDatabaseError(error: unknown, target: string): Explanation {
  const e = error as { code?: string; message?: string; cause?: unknown };
  // Drizzle wraps query failures; the database's own error is the cause.
  const inner = (e.cause ?? e) as { code?: string; message?: string; errno?: string };
  const code = inner.code ?? e.code;
  const message = inner.message ?? e.message ?? String(error);

  switch (code) {
    case "ECONNREFUSED":
      return {
        headline: `Nothing answers on ${target}.`,
        hint: "Is the database container running? `docker compose -f docker-compose.dev.yml up -d --wait` starts it and waits until it is ready.",
      };
    case "3D000":
      return {
        headline: `The database in ${target} does not exist.`,
        hint: "The compose file creates it on first start. If another Postgres (Haij's dev database, a local install) answers on this port, start Domino's on another one: `POSTGRES_PORT=5433 docker compose -f docker-compose.dev.yml up -d --wait` and change 5432 to 5433 in the three URLs in .env.",
      };
    case "28P01":
      return {
        headline: `Password refused for ${target}.`,
        hint: "The URL's password must match POSTGRES_PASSWORD for the container. A different Postgres on the same port is the usual reason.",
      };
    case "57P03":
      return {
        headline: `The database on ${target} is still starting up.`,
        hint: "Wait a few seconds and run `pnpm db:migrate` again, or start the container with `--wait`.",
      };
    default:
      return { headline: message };
  }
}

/**
 * The one failure the error codes above cannot explain, because it
 * happens before anything is dialled.
 *
 * docker-compose.yml builds this URL by pasting POSTGRES_PASSWORD into
 * `postgres://postgres:PASSWORD@db:5432/domino`. A password containing
 * `/`, `@`, `?` or `#` ends or redirects the URL there, and what pg then
 * receives is a different host, a different database, or nothing it can
 * parse. The database container is unaffected, because it gets the same
 * password as a plain variable where every character is allowed. So the
 * symptom is precisely this: db healthy, migrate dead, and an error about
 * a host nobody recognises.
 *
 * Returns the character to blame, or null when the URL is fine.
 */
export function unencodedPasswordCharacter(url: string): string | null {
  const withoutScheme = url.replace(/^[a-z+]+:\/\//i, "");
  // Deliberately not split on "/" first: a slash in the password is the
  // very thing being looked for, and splitting there would hide it. The
  // last "@" separates credentials from host in every URL this project
  // builds. A database name containing "@" would fool it into blaming a
  // password that is fine, which is a wrong message rather than a silent
  // failure, and no such database name exists here.
  const at = withoutScheme.lastIndexOf("@");
  if (at === -1) return null;
  const credentials = withoutScheme.slice(0, at);
  const colon = credentials.indexOf(":");
  if (colon === -1) return null;
  const password = credentials.slice(colon + 1);
  return [...password].find((c) => "/@?#".includes(c)) ?? null;
}

/**
 * Does this look like the compose file's own "you forgot to set this"
 * text rather than a value somebody chose?
 *
 * docker-compose.yml marks every secret `${NAME:?set NAME ...}`. In
 * compose, the text after `:?` is the error shown when the variable is
 * missing. Coolify reads the same file to pre-create the resource's
 * environment variables, and it fills each one with that text as its
 * value. The stack then starts, every service agreeing on a password of
 * `set POSTGRES_PASSWORD`, and nothing complains — which happened on the
 * first deployment of domino.haij.dk and was caught by a person reading
 * the variable list, not by anything in the code. This is the thing in
 * the code.
 */
export function looksLikeComposePlaceholder(value: string | undefined): boolean {
  return /^\s*set\s+[A-Z][A-Z0-9_]*\b/.test(value ?? "");
}

/** The password part of a postgres:// URL, or null when there is none. */
export function passwordIn(url: string): string | null {
  const withoutScheme = url.replace(/^[a-z+]+:\/\//i, "");
  const at = withoutScheme.lastIndexOf("@");
  if (at === -1) return null;
  const credentials = withoutScheme.slice(0, at);
  const colon = credentials.indexOf(":");
  return colon === -1 ? null : credentials.slice(colon + 1);
}

/** The connection target without the password, for messages and logs. */
export function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "the database";
  }
}

async function countApplied(client: Client): Promise<number | null> {
  try {
    const { rows } = await client.query<{ n: string }>(
      "select count(*)::text as n from drizzle.__drizzle_migrations",
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null; // first run: the journal table is not there yet
  }
}

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");

  const offending = unencodedPasswordCharacter(url);
  if (offending) {
    console.error(
      `migrate: the password in MIGRATION_DATABASE_URL contains "${offending}", which ends the URL there.`,
    );
    console.error(
      "migrate: this URL is built from POSTGRES_PASSWORD. Generate it with `openssl rand -hex 24` " +
        "rather than base64, which emits `/` and `+`. The database container is unaffected by this, " +
        "which is why it looks healthy while this step is not.",
    );
    console.error(
      "migrate: changing POSTGRES_PASSWORD is not enough on its own — Postgres only reads it when it " +
        "first initialises its data directory, so remove the database volume as well and let it start over.",
    );
    process.exit(1);
  }

  if (looksLikeComposePlaceholder(passwordIn(url) ?? undefined)) {
    console.error(
      "migrate: the password in MIGRATION_DATABASE_URL is the compose file's placeholder text, " +
        "not a password.",
    );
    console.error(
      "migrate: Coolify pre-fills every variable with the message after `:?` in docker-compose.yml. " +
        "Replace POSTGRES_PASSWORD, DOMINO_APP_PASSWORD, DOMINO_AUTH_PASSWORD and BETTER_AUTH_SECRET " +
        "with generated values (see docs/deploy.md), remove the database volume so Postgres " +
        "initialises with the real one, and deploy again.",
    );
    process.exit(1);
  }

  const target = describeTarget(url);

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    const { headline, hint } = explainDatabaseError(error, target);
    console.error(`migrate: ${headline}`);
    if (hint) console.error(`migrate: ${hint}`);
    process.exit(1);
  }

  try {
    const before = (await countApplied(client)) ?? 0;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const after = (await countApplied(client)) ?? before;
    const applied = after - before;
    console.log(
      applied === 0
        ? `migrate: ${target} is up to date (${after} migrations)`
        : `migrate: applied ${applied} migration${applied === 1 ? "" : "s"} to ${target} (${after} in total)`,
    );
  } catch (error) {
    const { headline, hint } = explainDatabaseError(error, target);
    console.error(`migrate: failed against ${target}`);
    console.error(`migrate: ${headline}`);
    if (hint) console.error(`migrate: ${hint}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Only run when invoked directly, so the tests can import the helpers.
if (process.argv[1]?.endsWith("migrate.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
