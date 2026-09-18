import type { Pool } from "pg";
import type { OrgContext } from "@/core/db/tenant";

/**
 * A workspace with one owner, seeded as the superuser the way Better Auth
 * would create it, so service tests can run as an ordinary member through
 * the RLS-guarded path without going through the sign-up form.
 */
export async function seedWorkspace(admin: Pool, key: string, role = "owner"): Promise<OrgContext> {
  const orgId = `org_${key}`;
  const userId = `user_${key}`;
  await admin.query(
    `insert into organizations (id, name, slug) values ($1, $2, $3) on conflict do nothing`,
    [orgId, `Workspace ${key}`, `ws-${key}`],
  );
  await admin.query(
    `insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing`,
    [userId, `User ${key}`, `${key}@example.com`],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role) values ($1, $2, $3, $4) on conflict do nothing`,
    [`mem_${key}`, orgId, userId, role],
  );
  return { orgId, userId };
}

/** A second person in an existing workspace. */
export async function seedMember(
  admin: Pool,
  orgId: string,
  key: string,
  role = "member",
): Promise<OrgContext> {
  const userId = `user_${key}`;
  await admin.query(
    `insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing`,
    [userId, `User ${key}`, `${key}@example.com`],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role) values ($1, $2, $3, $4) on conflict do nothing`,
    [`mem_${key}`, orgId, userId, role],
  );
  return { orgId, userId };
}
