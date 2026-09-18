import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { authDb } from "@/core/db/client";
import { memberships } from "@/core/db/schema";
import type { OrgContext } from "@/core/db/tenant";
import { auth } from "./auth";

/** Current session, or null. Cached per request. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Is this user still a member of this workspace?
 *
 * The session carries `activeOrganizationId` and lives for days. Removing
 * somebody from a workspace does not reach into the sessions they already
 * hold, so without this check a removed member keeps working until their
 * cookie expires. The membership row is the truth; the session only says
 * which workspace they were last looking at.
 *
 * Read on the auth role, which is the one allowed to see membership rows
 * without a tenant context already being set — the very thing we are
 * about to decide. Cached per request, so this costs one small indexed
 * lookup per page, not one per query.
 */
const stillAMember = cache(async (userId: string, orgId: string): Promise<boolean> => {
  const [row] = await authDb
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)))
    .limit(1);
  return Boolean(row);
});

/**
 * Tenant context for the current request, used with withOrgContext().
 * Returns null when there is no session, no active organization, or the
 * user is no longer a member of it.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await getSession();
  if (!session) return null;
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return null;
  if (!(await stillAMember(session.user.id, orgId))) return null;
  return { orgId, userId: session.user.id };
}
