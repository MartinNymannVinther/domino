import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, authClient, expectSqlError } from "../helpers/db";

/**
 * The acceptance criteria for phase 0: tenant isolation proven at the
 * database level. Everything here talks raw SQL as the runtime roles —
 * exactly what any application bug would be able to do, and no more.
 */

const ORG_A = "org_isolation_a";
const ORG_B = "org_isolation_b";
const USER_A = "user_isolation_a";
const USER_B = "user_isolation_b";
const CTX_A = { orgId: ORG_A, userId: USER_A };

let admin: Pool;
let app: Client;
let auth: Client;

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  auth = await authClient();

  await admin.query(
    `insert into organizations (id, name, slug, created_at) values
       ($1, 'Isolation A', 'isolation-a', now()),
       ($2, 'Isolation B', 'isolation-b', now())`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into users (id, name, email) values
       ($1, 'User A', 'isolation-a@example.com'),
       ($2, 'User B', 'isolation-b@example.com')`,
    [USER_A, USER_B],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role, created_at) values
       ('mem_isolation_a', $1, $3, 'owner', now()),
       ('mem_isolation_b', $2, $4, 'owner', now())`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
  await admin.query(
    `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type, entity_id)
     values ($1, $3, 'user', 'test.seed', 'test', 'seed-a'),
            ($2, $4, 'user', 'test.seed', 'test', 'seed-b')`,
    [ORG_A, ORG_B, USER_A, USER_B],
  );
});

afterAll(async () => {
  await app?.end();
  await auth?.end();
  await admin?.end();
});

describe("read isolation (application role)", () => {
  it("only sees organizations the user belongs to or has active", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select id from organizations order by id"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([ORG_A]);
  });

  it("cannot read org B's organization row even by primary key", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select id from organizations where id = $1", [ORG_B]),
    );
    expect(rows.rowCount).toBe(0);
  });

  it("cannot read org B's memberships", async () => {
    const rows = await asApp(app, CTX_A, (c) => c.query("select organization_id from memberships"));
    expect(rows.rows.every((r) => r.organization_id === ORG_A)).toBe(true);
    expect(rows.rowCount).toBeGreaterThan(0);
  });

  it("only sees its own user row", async () => {
    const rows = await asApp(app, CTX_A, (c) => c.query("select id from users"));
    expect(rows.rows.map((r) => r.id)).toEqual([USER_A]);
  });

  it("only sees audit entries for the active organization", async () => {
    const rows = await asApp(app, CTX_A, (c) =>
      c.query("select distinct org_id from audit_log where org_id is not null"),
    );
    expect(rows.rows.map((r) => r.org_id)).toEqual([ORG_A]);
  });
});

describe("write isolation (application role)", () => {
  it("cannot insert audit entries for another organization", async () => {
    const code = await asApp(app, CTX_A, (c) =>
      expectSqlError(
        c.query(
          `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type)
           values ($1, $2, 'user', 'test.forged', 'test')`,
          [ORG_B, USER_A],
        ),
      ),
    );
    expect(code).toBe("42501"); // row-level security violation
  });

  it("can insert audit entries for its own organization", async () => {
    const result = await asApp(app, CTX_A, (c) =>
      c.query(
        `insert into audit_log (org_id, actor_user_id, actor_type, action, entity_type)
         values ($1, $2, 'user', 'test.own', 'test') returning id`,
        [ORG_A, USER_A],
      ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("has no update/delete/insert privilege on organizations at all", async () => {
    for (const sql of [
      `update organizations set name = 'hacked' where id = '${ORG_B}'`,
      `update organizations set name = 'hacked' where id = '${ORG_A}'`,
      `delete from organizations where id = '${ORG_B}'`,
      `insert into organizations (id, name, slug, created_at) values ('org_x', 'X', 'x-slug', now())`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501"); // permission denied
    }
  });

  it("cannot touch memberships or users", async () => {
    for (const sql of [
      `update users set name = 'hacked' where id = '${USER_B}'`,
      `delete from memberships where id = 'mem_isolation_b'`,
      `insert into memberships (id, organization_id, user_id, role, created_at)
         values ('mem_forged', '${ORG_B}', '${USER_A}', 'owner', now())`,
    ]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501");
    }
  });
});

describe("default deny without tenant context", () => {
  it.each(["organizations", "users", "memberships", "audit_log"])(
    "sees zero rows in %s",
    async (table) => {
      const rows = await asApp(app, null, (c) =>
        c.query(`select count(*)::int as n from ${table}`),
      );
      expect(rows.rows[0].n).toBe(0);
    },
  );
});

describe("credential tables are unreachable for the application role", () => {
  it.each(["accounts", "sessions", "verifications", "passkeys", "two_factors", "rate_limits"])(
    "select on %s is denied",
    async (table) => {
      const code = await asApp(app, CTX_A, (c) =>
        expectSqlError(c.query(`select * from ${table}`)),
      );
      expect(code).toBe("42501");
    },
  );
});

describe("audit_log is append-only", () => {
  it("application role cannot update or delete", async () => {
    for (const sql of ["update audit_log set action = 'x'", "delete from audit_log"]) {
      const code = await asApp(app, CTX_A, (c) => expectSqlError(c.query(sql)));
      expect(code, sql).toBe("42501");
    }
  });

  it("even a superuser cannot update, delete or truncate", async () => {
    expect(await expectSqlError(admin.query("update audit_log set action = 'x' where true"))).toBe(
      "P0001",
    );
    expect(await expectSqlError(admin.query("delete from audit_log where true"))).toBe("P0001");
    expect(await expectSqlError(admin.query("truncate audit_log"))).toBe("P0001");
  });
});

describe("auth role confinement", () => {
  it("can read auth tables (its job)", async () => {
    const rows = await auth.query("select count(*)::int as n from users");
    expect(rows.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("can only append to the audit log, never read it", async () => {
    // No RETURNING: the auth role has INSERT but deliberately no SELECT.
    const insert = await auth.query(
      `insert into audit_log (org_id, actor_type, action, entity_type)
       values (null, 'system', 'test.auth-role', 'test')`,
    );
    expect(insert.rowCount).toBe(1);
    expect(await expectSqlError(auth.query("select * from audit_log"))).toBe("42501");
    const written = await admin.query(
      "select count(*)::int as n from audit_log where action = 'test.auth-role'",
    );
    expect(written.rows[0].n).toBe(1);
  });
});

describe("rls coverage (guards future tables)", () => {
  it("every table in public has row level security enabled AND forced", async () => {
    const rows = await admin.query(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
         and not (relrowsecurity and relforcerowsecurity)`,
    );
    expect(rows.rows.map((r) => r.relname)).toEqual([]);
  });

  it("runtime roles cannot bypass rls", async () => {
    const rows = await admin.query(
      `select rolname from pg_roles
       where rolname in ('domino_app', 'domino_auth') and (rolbypassrls or rolsuper)`,
    );
    expect(rows.rows).toEqual([]);
  });

  /**
   * Forced RLS with no policy denies everything, which is safe but is not
   * what a new table is meant to do — it is what a new table does when
   * somebody forgot the policy, and the failure shows up as an empty page
   * rather than as an error. The check above passes either way, so it
   * cannot tell the two apart. This one can.
   */
  it("every table has at least one policy", async () => {
    const rows = await admin.query(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    );
    expect(rows.rows.map((r) => r.relname)).toEqual([]);
  });

  /**
   * A policy granted TO PUBLIC applies to every role there is. Domino's
   * policies name domino_app or domino_auth on purpose; one written without
   * a TO clause would quietly widen the whole model.
   */
  it("no policy is granted to public", async () => {
    const rows = await admin.query(
      `select c.relname, p.polname from pg_policy p
       join pg_class c on c.oid = p.polrelid
       where c.relnamespace = 'public'::regnamespace and p.polroles = '{0}'`,
    );
    expect(rows.rows.map((r) => `${r.relname}.${r.polname}`)).toEqual([]);
  });

  /**
   * Dogma 6 says every change lands in an audit log that cannot be
   * edited. That is a per-table trigger, so a table added without one is
   * a hole in the claim rather than in a feature.
   *
   * Some tables carry no trigger on purpose, and they are named here
   * rather than guessed at, so that a new table cannot quietly join them:
   * auditing a log is a copy, not a record (docs/adr/0003, 0005), and a
   * counter or a cache holds nothing anybody owns. Adding a name to this
   * list should be an argument somebody has to make in a pull request.
   */
  const NO_AUDIT_TRIGGER = [
    // Carries the append-only guard instead; proven below.
    "audit_log",
    // The record of what happened when a flow ran, and a counter: not
    // things a workspace edits, and auditing a record is a copy.
    "runs",
    "run_steps",
    "ai_calls",
    // Auth machinery Better Auth owns and rotates; sessions are recorded
    // as auth events by the hooks in src/core/auth/auth.ts instead.
    "sessions",
    "verifications",
    "rate_limits",
    // Admission, which happens before a workspace exists to own it.
    "access_requests",
    "access_invitations",
    // Throwaway by definition, deleted whole when it expires.
    "demo_workspaces",
  ];

  it("every domain table has an audit trigger", async () => {
    const rows = await admin.query(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and not (c.relname = any($1))
         and not exists (
           select 1 from pg_trigger t
           where t.tgrelid = c.oid and not t.tgisinternal
             and t.tgname like 'audit\\_%'
         )`,
      [NO_AUDIT_TRIGGER],
    );
    expect(rows.rows.map((r) => r.relname)).toEqual([]);
  });

  it("the tables excused from auditing are all still there", async () => {
    // A name left behind after its table is gone is a hole the list above
    // would hide rather than show.
    const rows = await admin.query(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and c.relname = any($1)`,
      [NO_AUDIT_TRIGGER],
    );
    expect(rows.rows.map((r) => r.relname).sort()).toEqual([...NO_AUDIT_TRIGGER].sort());
  });

  it("the audit log cannot be updated or deleted, not even by the superuser", async () => {
    await admin.query(
      `insert into audit_log (org_id, actor_type, action, entity_type)
       values (null, 'system', 'test.append-only', 'test')`,
    );
    expect(
      await expectSqlError(
        admin.query("update audit_log set action = 'tampered' where action = 'test.append-only'"),
      ),
    ).toBeTruthy();
    expect(
      await expectSqlError(admin.query("delete from audit_log where action = 'test.append-only'")),
    ).toBeTruthy();
  });

  /**
   * A SECURITY DEFINER function runs as its owner — here the migration
   * superuser — so a runtime role that may call one is outside RLS for as
   * long as it runs. That is the whole reason the roles themselves have no
   * BYPASSRLS: the exceptions are named functions doing one thing each,
   * not a role with the door left open.
   *
   * So the exceptions are named here too, and a new one has to be argued
   * for in a pull request rather than merged quietly. Trigger functions
   * are excluded because nothing calls them: they run on a write the
   * policies already decided to allow.
   */
  const CALLABLE_DEFINER_FUNCTIONS = [
    // Returns the installation's model-call count for the last day, across
    // every workspace (docs/adr/0035). A number crosses the boundary; no
    // row does, and it takes no arguments, so it can answer one question
    // and only that one.
    "ai_calls_last_day",
    // The runner's two doors (docs/adr/0013, drizzle/0005): claims the
    // oldest queued run whoever owns it and hands back three ids, never
    // a row; and fails the runs a stopped process left running. Both
    // take no arguments and answer one question each.
    "claim_next_run",
    // Deletes a workspace the caller owns, audit rows included, which is
    // dogma 3 and which RLS and the append-only guard would otherwise
    // forbid (docs/adr/0003). Checks the caller's role itself.
    "delete_workspace",
    "fail_interrupted_runs",
  ];

  it("only the named definer functions can be called by a runtime role", async () => {
    const rows = await admin.query(
      `select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prosecdef
         and pg_get_function_result(p.oid) <> 'trigger'
         and (has_function_privilege('domino_app', p.oid, 'execute')
              or has_function_privilege('domino_auth', p.oid, 'execute'))
       order by p.proname`,
    );
    expect(rows.rows.map((r) => r.proname)).toEqual(CALLABLE_DEFINER_FUNCTIONS);
  });

  it("the ai call counter is reachable from the app role and nowhere else", async () => {
    const rows = await admin.query(
      `select has_function_privilege('domino_app', 'ai_calls_last_day()', 'execute') as app,
              has_function_privilege('domino_auth', 'ai_calls_last_day()', 'execute') as auth,
              has_function_privilege('public', 'ai_calls_last_day()', 'execute') as anyone`,
    );
    expect(rows.rows[0]).toEqual({ app: true, auth: false, anyone: false });
  });
});
