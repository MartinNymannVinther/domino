import { sql } from "drizzle-orm";
import { auditLog } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { EXPORT_TABLES, MEMBERS_SHEET, type ExportTable } from "./tables";

/**
 * The whole workspace, on its way out.
 *
 * Full export is a dogma: you must be able to leave. So the export reads
 * through the ordinary RLS-guarded path, as the application role, with the
 * tenant context set — exactly like every other query. It is not a
 * privileged back door that happens to be shaped like a feature, and the
 * isolation test proves one workspace's export cannot contain another's
 * rows.
 *
 * Columns are read as they are named in the database rather than mapped to
 * prettier labels. An export is a record, not a report: the value of it is
 * that a row means the same thing outside Domino as it did inside.
 */

export type ExportSection = {
  sheet: string;
  columns: string[];
  rows: unknown[][];
};

export type OrgExport = {
  organization: { id: string; name: string; slug: string | null };
  exportedAt: Date;
  sections: ExportSection[];
};

/** Columns present on every domain table that say nothing a reader wants. */
const NOISE = new Set(["search_vector"]);

async function readTable(tx: AppTransaction, spec: ExportTable): Promise<ExportSection> {
  const order = spec.orderBy ? ` order by ${spec.orderBy} nulls last` : "";
  // Table and column names come from EXPORT_TABLES, a fixed list in this
  // repository; nothing here is ever built from a request.
  const result = await tx.execute(sql.raw(`select * from "${spec.table}"${order}`));

  const rows = result.rows as Array<Record<string, unknown>>;
  const redact = new Set(spec.redact ?? []);
  const first = rows[0];
  const columns = (first ? Object.keys(first) : []).filter(
    (column) => !redact.has(column) && !NOISE.has(column),
  );

  return {
    sheet: spec.sheet,
    columns,
    rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
  };
}

/**
 * The members, from the workspace's own membership rather than from the
 * auth tables: who is in this workspace and in what role, without carrying
 * credentials along.
 */
async function readMembers(tx: AppTransaction): Promise<ExportSection> {
  const result = await tx.execute(sql`
    select u.name, u.email, m.role, m.created_at
    from memberships m
    join users u on u.id = m.user_id
    order by m.created_at
  `);
  const rows = result.rows as Array<Record<string, unknown>>;
  const columns = ["name", "email", "role", "created_at"];
  return {
    sheet: MEMBERS_SHEET,
    columns,
    rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
  };
}

export async function buildOrgExport(ctx: OrgContext): Promise<OrgExport> {
  return withOrgContext(ctx, async (tx) => {
    const org = await tx.execute(sql`
      select id, name, slug from organizations where id = ${ctx.orgId} limit 1
    `);
    const organization = (org.rows[0] ?? {}) as { id: string; name: string; slug: string | null };

    const sections: ExportSection[] = [await readMembers(tx)];
    for (const spec of EXPORT_TABLES) {
      sections.push(await readTable(tx, spec));
    }

    // Taking a copy of everything out of the system is itself worth
    // recording: the audit log should be able to answer "when did the data
    // last leave, and who took it".
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      actorType: "user",
      action: "workspace.exported",
      entityType: "organizations",
      entityId: ctx.orgId,
      after: {
        sections: sections.length,
        rows: sections.reduce((total, section) => total + section.rows.length, 0),
      },
    });

    return { organization, exportedAt: new Date(), sections };
  });
}
