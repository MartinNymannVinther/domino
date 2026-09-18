import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { databaseName, maintenanceUrl, resolveTestDatabaseUrls } from "./test-env";

/**
 * Prepares the test database: creates it if it is not there, then drops
 * the schema and migrates from zero. audit_log is append-only even for
 * superusers, so a fresh schema is the only clean slate — which
 * conveniently also proves a fresh checkout can migrate from nothing.
 *
 * The database is never the one in `.env`: see tests/test-env.ts, which
 * rewrites every URL to a `_test` sibling and refuses to run otherwise.
 *
 * Afterwards the runtime roles get LOGIN plus the passwords embedded in
 * the APP/AUTH URLs, so tests and CI need no separate provisioning.
 */
export default async function globalSetup() {
  const urls = resolveTestDatabaseUrls();
  const target = databaseName(urls.MIGRATION_DATABASE_URL);

  // Roles are cluster-wide, but a database is not: a first run on a new
  // machine has nothing to connect to yet.
  const maintenance = new Client({ connectionString: maintenanceUrl(urls.MIGRATION_DATABASE_URL) });
  await maintenance.connect();
  try {
    const { rowCount } = await maintenance.query("select 1 from pg_database where datname = $1", [
      target,
    ]);
    // Parameters are not allowed in CREATE DATABASE; the name comes from
    // our own suffixing, and quote_ident closes the gap either way.
    if (rowCount === 0) {
      const { rows } = await maintenance.query<{ ident: string }>(
        "select quote_ident($1) as ident",
        [target],
      );
      await maintenance.query(`create database ${rows[0]!.ident}`);
    }
  } finally {
    await maintenance.end();
  }

  const admin = new Pool({ connectionString: urls.MIGRATION_DATABASE_URL, max: 1 });
  try {
    await admin.query("drop schema if exists public cascade");
    await admin.query("create schema public");
    await admin.query("drop schema if exists drizzle cascade");

    await migrate(drizzle(admin), { migrationsFolder: "./drizzle" });

    for (const envName of ["APP_DATABASE_URL", "AUTH_DATABASE_URL"] as const) {
      const { username, password } = new URL(urls[envName]);
      await admin.query(
        `alter role ${username} login password '${decodeURIComponent(password).replaceAll("'", "''")}'`,
      );
    }
  } finally {
    await admin.end();
  }
}
