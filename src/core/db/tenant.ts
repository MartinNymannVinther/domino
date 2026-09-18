import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { appDb } from "./client";
import type * as schema from "./schema";

export type OrgContext = {
  orgId: string;
  userId: string;
};

export type AppTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Runs `fn` inside a transaction on the application role with the tenant
 * context set for RLS. Every domain query MUST go through this helper (or a
 * service built on it); outside of it the application role sees zero rows.
 *
 * `set_config(..., true)` is transaction-local, so the context can never leak
 * to another request sharing the pooled connection.
 */
export async function withOrgContext<T>(
  ctx: OrgContext,
  fn: (tx: AppTransaction) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}
