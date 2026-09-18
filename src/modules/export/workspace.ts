import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/core/auth/auth";
import { memberships, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

/**
 * The workspace itself: who is in it, and the one way out. Deletion runs
 * through `delete_workspace()` in the database, which checks that the
 * caller owns the workspace, removes everything it holds including the
 * audit rows about it, and leaves one context-free row saying it happened.
 */

export type Member = { userId: string; name: string; email: string; role: string; joinedAt: Date };

export async function listMembers(ctx: OrgContext): Promise<Member[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        userId: memberships.userId,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, ctx.orgId))
      .orderBy(memberships.createdAt);
    return rows;
  });
}

/**
 * The caller's role in the *active* workspace. Both halves of the where
 * clause matter: RLS on memberships lets a user see their own rows in
 * every workspace they belong to, so filtering on the user alone would
 * return an arbitrary one — and a member of this workspace who owns
 * another would read as an owner here.
 */
export async function currentRole(ctx: OrgContext): Promise<string | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.organizationId, ctx.orgId)))
      .limit(1);
    return row?.role ?? null;
  });
}

export type DeleteResult = "deleted" | "notOwner" | "nameMismatch" | "failed";

/** Postgres' `insufficient_privilege`, which is how a refusal says so. */
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * The SQLSTATE behind a failed query, or undefined when there is none.
 *
 * Drizzle wraps what the driver threw, so the database's own error is the
 * cause; `pg` puts the code on the error itself. Both are looked at, and
 * the chain is walked rather than assumed to be one deep.
 */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Deletes the active workspace. The person types the workspace's name to
 * confirm; the database function checks ownership itself, so the check
 * here is for the message, not for safety.
 */
export async function deleteWorkspace(
  ctx: OrgContext,
  typedName: string,
  headers: Headers,
): Promise<DeleteResult> {
  const organization = await auth.api.getFullOrganization({
    headers,
    query: { organizationId: ctx.orgId },
  });
  if (!organization) return "failed";
  if (organization.name.trim() !== typedName.trim()) return "nameMismatch";
  try {
    await withOrgContext(ctx, async (tx) => {
      await tx.execute(sql`select delete_workspace(${ctx.orgId})`);
    });
  } catch (error) {
    // The code, not the wording. This branch used to match the text
    // `only the workspace owner` against the exception raised in the
    // database, so a later CREATE OR REPLACE that reworded the sentence
    // would have degraded "you are not the owner" to a nameless failure
    // with no test to notice. drizzle/0016_owner_errcode.sql gives that
    // one raise ERRCODE 42501, and nothing else in delete_workspace()
    // raises it. The old message match is gone rather than kept as a
    // fallback: with it still here, tests/export/workspace would pass on
    // the fallback and go on claiming a path it was no longer taking.
    // Nothing runs against a database this migration has not reached —
    // docker-compose.yml starts the app only on the migration step's
    // `service_completed_successfully`.
    if (sqlStateOf(error) === INSUFFICIENT_PRIVILEGE) return "notOwner";
    console.error("workspace: delete failed", error);
    return "failed";
  }
  return "deleted";
}
