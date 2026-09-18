// Loaded before anything touches the environment: a standalone script gets
// no help from Next.js, which normally reads .env for us.
import "dotenv/config";

import { Pool } from "pg";

/**
 * Names the installation's owner: who may admit new workspaces.
 *
 *     pnpm script scripts/grant-owner.ts                 # shows who holds it
 *     pnpm script scripts/grant-owner.ts <email>         # gives it to that user
 *     pnpm script scripts/grant-owner.ts <email> --only  # ... and takes it from everyone else
 *
 * The role goes to the first account on an empty installation by itself,
 * and the migration that introduced it gave it to the oldest user of an
 * installation that already existed. That guess is right for a fresh
 * install and wrong for a development database full of test users, which
 * is what this script is for. Deliberately a script and not a setting in
 * the interface (ADR 0004): the right changes hands about as often as the
 * server does, and it belongs with the person who has database credentials.
 *
 * Runs as the migration role, like the other maintenance scripts.
 */

const args = process.argv.slice(2);
const only = args.includes("--only");
const email = args
  .find((arg) => !arg.startsWith("--"))
  ?.trim()
  .toLowerCase();

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    if (email) {
      const user = await pool.query<{ id: string }>(
        "select id from users where lower(email) = $1",
        [email],
      );
      if (user.rowCount === 0) {
        const known = await pool.query<{ email: string }>(
          "select email from users order by created_at",
        );
        throw new Error(
          `Ingen bruger med e-mailen ${email}. Kendte: ${known.rows.map((r) => r.email).join(", ") || "ingen"}`,
        );
      }
      if (only) {
        await pool.query("update users set platform_role = null where platform_role = 'owner'");
      }
      await pool.query("update users set platform_role = 'owner' where id = $1", [
        user.rows[0]!.id,
      ]);
      console.log(`${email} er nu ejer af installationen${only ? " (og den eneste)" : ""}.`);
    }

    const owners = await pool.query<{ email: string; created_at: Date }>(
      "select email, created_at from users where platform_role = 'owner' order by created_at",
    );
    if (owners.rowCount === 0) {
      console.log("Ingen ejer. Giv rollen med: pnpm script scripts/grant-owner.ts <email>");
    } else {
      console.log(
        `Ejer${owners.rowCount === 1 ? "" : "e"}: ${owners.rows.map((r) => r.email).join(", ")}`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nFejlede:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
