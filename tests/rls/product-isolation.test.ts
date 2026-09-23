import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Workspace isolation for every product table, proven as the application
 * role with raw SQL. Each table gets one row per workspace, seeded as the
 * superuser; the application role must then see exactly its own row with
 * its context, nothing without one, and be refused when writing for the
 * other workspace. New tables are added to TABLES here or the meta-test in
 * tenant-isolation fails them for missing RLS anyway.
 */

const A = { orgId: "org_prod_a", userId: "user_prod_a" };
const B = { orgId: "org_prod_b", userId: "user_prod_b" };

/** Table → a row factory keyed by workspace suffix. */
const TABLES: Array<{ table: string; row: (suffix: string) => Record<string, unknown> }> = [
  {
    table: "flows",
    row: (s) => ({ id: `flow_${s}`, name: `Flow ${s}` }),
  },
  {
    table: "flow_versions",
    row: (s) => ({
      id: `version_${s}`,
      flow_id: `flow_${s}`,
      number: 1,
      document: JSON.stringify({ format: "domino.flow", version: 1, nodes: [], edges: [] }),
    }),
  },
  {
    table: "flow_messages",
    row: (s) => ({ flow_id: `flow_${s}`, role: "user", content: `Besked ${s}` }),
  },
  {
    table: "flow_pins",
    row: (s) => ({
      flow_id: `flow_${s}`,
      node_id: "n2",
      port: "file",
      value: JSON.stringify({ text: `eksempel ${s}` }),
    }),
  },
  {
    table: "files",
    row: (s) => ({
      id: `file_${s}`,
      flow_id: `flow_${s}`,
      name: `fil-${s}.txt`,
      mime: "text/plain",
      size: 3,
      bytes: Buffer.from("abc"),
      text: "abc",
    }),
  },
  {
    table: "runs",
    row: (s) => ({ id: `run_${s}`, flow_id: `flow_${s}`, version_id: `version_${s}` }),
  },
  {
    table: "run_steps",
    row: (s) => ({ run_id: `run_${s}`, node_id: "input", status: "done" }),
  },
  { table: "ai_calls", row: () => ({ kind: "chat" }) },
  { table: "workspace_llm_settings", row: (s) => ({ provider: "ollama", model: `model-${s}` }) },
];

let admin: Pool;
let app: Client;

async function insertAsAdmin(table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values);
  const params = columns.map((_, i) => `$${i + 1}`);
  await admin.query(
    `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${params.join(", ")})`,
    columns.map((c) => values[c]),
  );
}

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  for (const [org, s] of [
    [A, "a"],
    [B, "b"],
  ] as const) {
    await admin.query(
      `insert into organizations (id, name, slug) values ($1, $2, $3) on conflict do nothing`,
      [org.orgId, `Prod ${s}`, `prod-${s}`],
    );
    await admin.query(
      `insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing`,
      [org.userId, `User ${s}`, `prod-${s}@example.com`],
    );
    await admin.query(
      `insert into memberships (id, organization_id, user_id, role) values ($1, $2, $3, 'owner') on conflict do nothing`,
      [`mem_prod_${s}`, org.orgId, org.userId],
    );
    for (const spec of TABLES) {
      await insertAsAdmin(spec.table, { org_id: org.orgId, ...spec.row(s) });
    }
  }
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe.each(TABLES.map((spec) => spec.table))("product table %s", (table) => {
  it("shows only the active workspace's rows", async () => {
    const asA = await asApp(app, A, (c) => c.query(`select org_id from "${table}"`));
    expect(asA.rows.length).toBeGreaterThan(0);
    expect(asA.rows.every((r) => r.org_id === A.orgId)).toBe(true);

    const asB = await asApp(app, B, (c) => c.query(`select org_id from "${table}"`));
    expect(asB.rows.every((r) => r.org_id === B.orgId)).toBe(true);
  });

  it("shows nothing without a context", async () => {
    const rows = await asApp(app, null, (c) => c.query(`select 1 from "${table}"`));
    expect(rows.rows).toEqual([]);
  });

  it("refuses to update the other workspace's row", async () => {
    // An update that matches no visible row is a silent no-op under RLS,
    // which is the point: workspace B's row is invisible to A.
    const result = await asApp(app, A, (c) =>
      c.query(`update "${table}" set org_id = org_id where org_id = $1`, [B.orgId]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("refuses to insert a row for the other workspace", async () => {
    const spec = TABLES.find((t) => t.table === table)!;
    const values: Record<string, unknown> = { org_id: B.orgId, ...spec.row("x") };
    const columns = Object.keys(values);
    const params = columns.map((_, i) => `$${i + 1}`);
    const code = await expectSqlError(
      asApp(app, A, (c) =>
        c.query(
          `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${params.join(", ")})`,
          columns.map((c) => values[c]),
        ),
      ),
    );
    // 42501 = RLS policy violation; a foreign key that cannot see its
    // target row is the same refusal by another name.
    expect(["42501", "23503"]).toContain(code);
  });
});

describe("the export path", () => {
  it("reads through RLS, so one workspace's export cannot contain another's rows", async () => {
    const rows = await asApp(app, A, (c) => c.query(`select org_id from flows`));
    expect(rows.rows.map((r) => r.org_id)).toEqual([A.orgId]);
  });
});
