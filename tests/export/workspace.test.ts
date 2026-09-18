import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { auth } from "@/core/auth/auth";
import { flows } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { exportFileName, exportToJson, exportToXlsx } from "@/modules/export/format";
import { buildOrgExport } from "@/modules/export/service";
import { EXPORT_TABLES, MEMBERS_SHEET } from "@/modules/export/tables";
import { deleteWorkspace, sqlStateOf } from "@/modules/export/workspace";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * Dogma three, proven: the whole workspace comes out as a spreadsheet and
 * as JSON, through the RLS-guarded path, one workspace's export holds
 * nothing of another's, and the way out is open to the owner and to
 * nobody else.
 */

let admin: Pool;
let a: OrgContext;
let b: OrgContext;

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "export_a");
  b = await seedWorkspace(admin, "export_b");
  // A row each, written the way the flow service will write it once it
  // exists: through the tenant context, as the application role.
  for (const ctx of [a, b]) {
    await withOrgContext(ctx, (tx) =>
      tx
        .insert(flows)
        .values({ orgId: ctx.orgId, name: `Flow i ${ctx.orgId}`, createdBy: ctx.userId }),
    );
  }
});

afterAll(async () => {
  await admin.end();
});

describe("the workspace export", () => {
  it("holds one tab per table, members first, and nothing from another workspace", async () => {
    const data = await buildOrgExport(a);
    expect(data.sections.map((s) => s.sheet)).toEqual([
      MEMBERS_SHEET,
      ...EXPORT_TABLES.map((t) => t.sheet),
    ]);
    const sheet = data.sections.find((s) => s.sheet === "Flows")!;
    const names = sheet.rows.map((row) => row[sheet.columns.indexOf("name")]);
    expect(names).toEqual([`Flow i ${a.orgId}`]);
    const members = data.sections.find((s) => s.sheet === MEMBERS_SHEET)!;
    expect(members.rows.map((row) => row[1])).toEqual(["export_a@example.com"]);
  });

  it("records that the data left, in the audit log", async () => {
    const rows = await admin.query(
      `select count(*)::int as n from audit_log where org_id = $1 and action = 'workspace.exported'`,
      [a.orgId],
    );
    expect(rows.rows[0].n).toBeGreaterThan(0);
  });

  it("writes the same rows as JSON and as a workbook", async () => {
    const data = await buildOrgExport(b);
    const json = JSON.parse(exportToJson(data));
    expect(json.domino.format).toBe(1);
    expect(json.tables.Flows.map((row: { name: string }) => row.name)).toEqual([
      `Flow i ${b.orgId}`,
    ]);
    const workbook = exportToXlsx(data);
    expect(workbook.subarray(0, 2).toString()).toBe("PK");
    expect(exportFileName("Team Æble", new Date("2026-09-11T10:00:00Z"), "xlsx")).toBe(
      "domino-team-aeble-2026-09-11.xlsx",
    );
  });
});

/**
 * The other half of dogma three: leaving takes a few clicks, and only the
 * owner's. Which refusal the person is shown used to be decided by
 * matching the text `only the workspace owner` against the exception
 * `delete_workspace()` raises, so a reworded message would have degraded
 * "you are not the owner" to a nameless failure with nothing to notice.
 * drizzle/0003_product_rls_audit.sql raises that one with ERRCODE 42501 and
 * the branch reads the code; these tests are what holds both ends still.
 */
describe("deleting the workspace", () => {
  let owner: OrgContext;
  let member: OrgContext;
  const NAME = "Workspace delete_me";

  beforeAll(async () => {
    owner = await seedWorkspace(admin, "delete_me");
    member = await seedMember(admin, owner.orgId, "delete_me_member");
  });

  beforeEach(() => {
    // The only thing deleteWorkspace asks Better Auth for is the name the
    // person has to type; the session itself is not what this is about.
    vi.spyOn(auth.api, "getFullOrganization").mockResolvedValue({ name: NAME } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The error a call to `delete_workspace()` threw, or null if it did not. */
  async function refusalFor(ctx: OrgContext, orgId: string): Promise<unknown> {
    return withOrgContext(ctx, (tx) => tx.execute(sql`select delete_workspace(${orgId})`)).then(
      () => null,
      (error: unknown) => error,
    );
  }

  it("refuses a member with insufficient_privilege, whatever the sentence says", async () => {
    const error = await refusalFor(member, member.orgId);
    expect(error).not.toBeNull();
    expect(sqlStateOf(error)).toBe("42501");
  });

  it("keeps the backstop's refusal apart from the owner's", async () => {
    // The active-workspace check keeps plpgsql's default P0001 on purpose,
    // so it reaches the person as a failure and not as a wrong sentence
    // about ownership.
    const error = await refusalFor(owner, "org_export_a");
    expect(sqlStateOf(error)).toBe("P0001");
  });

  it("finds the code through the layer drizzle wraps it in", () => {
    // What pg throws sits under drizzle's own error, and the message up
    // top says nothing about owners. This is the shape the branch reads.
    const wrapped = new Error("Failed query: select delete_workspace($1)", {
      cause: Object.assign(new Error("noget helt andet"), { code: "42501" }),
    });
    expect(sqlStateOf(wrapped)).toBe("42501");
    expect(sqlStateOf(new Error("only the workspace owner may delete it"))).toBeUndefined();
  });

  it("tells a member they are not the owner, and leaves the workspace standing", async () => {
    expect(await deleteWorkspace(member, NAME, new Headers())).toBe("notOwner");
    const { rowCount } = await admin.query("select 1 from organizations where id = $1", [
      owner.orgId,
    ]);
    expect(rowCount).toBe(1);
  });

  it("asks the owner for the name before it lets go", async () => {
    expect(await deleteWorkspace(owner, "noget andet", new Headers())).toBe("nameMismatch");
  });

  it("lets the owner delete it, rows and audit trail and all", async () => {
    expect(await deleteWorkspace(owner, NAME, new Headers())).toBe("deleted");
    const gone = await admin.query("select 1 from organizations where id = $1", [owner.orgId]);
    expect(gone.rowCount).toBe(0);
    const shadow = await admin.query("select 1 from audit_log where org_id = $1", [owner.orgId]);
    expect(shadow.rowCount).toBe(0);
    const record = await admin.query(
      "select 1 from audit_log where action = 'workspace.deleted' and entity_id = $1",
      [owner.orgId],
    );
    expect(record.rowCount).toBe(1);
  });
});
