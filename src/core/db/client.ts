import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/core/env";
import * as schema from "./schema";

/**
 * Two separate connection pools, two separate database roles:
 *
 * - appPool/appDb  → role `domino_app`: every domain query. Fully subject to
 *   RLS; without an org context set it sees nothing (default deny).
 * - authPool/authDb → role `domino_auth`: used only by Better Auth and the
 *   admission flow, which by nature must look up users before an org
 *   context exists. The role is only granted access to the auth tables.
 *
 * Neither role can bypass RLS. Migrations run through a third connection
 * (MIGRATION_DATABASE_URL) used exclusively by drizzle-kit.
 */

const globalForDb = globalThis as unknown as {
  dominoAppPool?: Pool;
  dominoAuthPool?: Pool;
};

export const appPool =
  globalForDb.dominoAppPool ?? new Pool({ connectionString: env.APP_DATABASE_URL, max: 10 });

export const authPool =
  globalForDb.dominoAuthPool ?? new Pool({ connectionString: env.AUTH_DATABASE_URL, max: 10 });

if (env.NODE_ENV !== "production") {
  globalForDb.dominoAppPool = appPool;
  globalForDb.dominoAuthPool = authPool;
}

export const appDb = drizzle(appPool, { schema });
export const authDb = drizzle(authPool, { schema });
