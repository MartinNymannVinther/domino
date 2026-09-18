import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { registerUserWithOrganization } from "@/core/auth/register";
import { memberships, organizations, users } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { adminPool, appClient, asApp } from "../helpers/db";

/**
 * End-to-end signup flow against the real Better Auth instance and the real
 * database: signup creates the user AND their organization, the audit trail
 * records every step, and the data is reachable through the RLS-guarded
 * application path afterwards.
 */

const EMAIL_A = "flow-a@example.com";
const EMAIL_B = "flow-b@example.com";
const PASSWORD = "en-meget-lang-kode-123";

let admin: Pool;
let app: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
});

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

async function register(email: string, organizationName: string) {
  const result = await registerUserWithOrganization(new Headers(), {
    name: "Flow Tester",
    email,
    password: PASSWORD,
    organizationName,
  });
  expect(result).toEqual({ ok: true });
  const user = await admin.query("select id from users where email = $1", [email]);
  const membership = await admin.query(
    "select organization_id, role from memberships where user_id = $1",
    [user.rows[0].id],
  );
  return {
    userId: user.rows[0].id as string,
    orgId: membership.rows[0].organization_id as string,
    role: membership.rows[0].role as string,
  };
}

describe("signup creates a user and their organization", () => {
  it("creates user, organization and owner membership; session gets the org", async () => {
    const { userId, orgId, role } = await register(EMAIL_A, "Flowfirma ÆØÅ ApS");
    expect(role).toBe("owner");

    const org = await admin.query("select name, slug from organizations where id = $1", [orgId]);
    expect(org.rows[0].name).toBe("Flowfirma ÆØÅ ApS");
    expect(org.rows[0].slug).toMatch(/^flowfirma-aeoeaa-aps-/);

    const session = await admin.query(
      "select active_organization_id from sessions where user_id = $1 order by created_at desc limit 1",
      [userId],
    );
    expect(session.rows[0].active_organization_id).toBe(orgId);
  });

  it("records the whole flow in the audit log", async () => {
    const user = await admin.query("select id from users where email = $1", [EMAIL_A]);
    const userId = user.rows[0].id;
    const actions = await admin.query(
      `select action from audit_log
       where entity_id = $1 or actor_user_id = $1 or after_data ->> 'user_id' = $1
       order by id`,
      [userId],
    );
    const seen = actions.rows.map((r) => r.action);
    expect(seen).toContain("users.insert");
    expect(seen).toContain("accounts.insert");
    expect(seen).toContain("auth.login");
    expect(seen).toContain("memberships.insert");
  });

  it("redacts password hashes from the audit trail", async () => {
    const rows = await admin.query(
      `select after_data from audit_log where action = 'accounts.insert'`,
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.after_data.password).toBeUndefined();
      expect(row.after_data.user_id).toBeDefined();
    }
  });

  it("audits organization creation with the organization as org scope", async () => {
    const { rows } = await admin.query(
      `select org_id, after_data ->> 'name' as name from audit_log
       where action = 'organizations.insert' and after_data ->> 'name' = 'Flowfirma ÆØÅ ApS'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].org_id).not.toBeNull();
  });
});

describe("the app path serves the new tenant through RLS", () => {
  it("withOrgContext returns the organization for its own member", async () => {
    const user = await admin.query("select id from users where email = $1", [EMAIL_A]);
    const membership = await admin.query(
      "select organization_id from memberships where user_id = $1",
      [user.rows[0].id],
    );
    const context = { userId: user.rows[0].id, orgId: membership.rows[0].organization_id };

    const result = await withOrgContext(context, (tx) =>
      tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, context.orgId)),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Flowfirma ÆØÅ ApS");

    const self = await withOrgContext(context, (tx) =>
      tx.select({ id: users.id }).from(users).where(eq(users.id, context.userId)),
    );
    expect(self).toHaveLength(1);

    const members = await withOrgContext(context, (tx) =>
      tx.select({ userId: memberships.userId }).from(memberships),
    );
    expect(members.map((m) => m.userId)).toEqual([context.userId]);
  });

  it("two freshly signed-up tenants cannot see each other", async () => {
    const b = await register(EMAIL_B, "Anden Virksomhed");
    const userA = await admin.query("select id from users where email = $1", [EMAIL_A]);
    const membershipA = await admin.query(
      "select organization_id from memberships where user_id = $1",
      [userA.rows[0].id],
    );
    const ctxA = {
      orgId: membershipA.rows[0].organization_id as string,
      userId: userA.rows[0].id as string,
    };

    // A, with A's context, sees exactly one organization: their own.
    const seenByA = await asApp(app, ctxA, (c) => c.query("select id from organizations"));
    expect(seenByA.rows.map((r) => r.id)).toEqual([ctxA.orgId]);

    // A cannot see B's organization, user or audit entries.
    const orgB = await asApp(app, ctxA, (c) =>
      c.query("select id from organizations where id = $1", [b.orgId]),
    );
    expect(orgB.rowCount).toBe(0);
    const userB = await asApp(app, ctxA, (c) =>
      c.query("select id from users where id = $1", [b.userId]),
    );
    expect(userB.rowCount).toBe(0);
    const auditB = await asApp(app, ctxA, (c) =>
      c.query("select id from audit_log where org_id = $1", [b.orgId]),
    );
    expect(auditB.rowCount).toBe(0);
  });
});
