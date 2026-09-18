import { customType, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { flows } from "./flows";
import { tenant } from "./shared";

/**
 * A file somebody uploaded as input to a flow — an application, a
 * contract, a spreadsheet — and the text pulled out of it.
 *
 * The bytes live in the database, not on disk (docs/adr/0011). One
 * Postgres is the whole state of an installation: a backup is a backup,
 * a deleted workspace takes its files with it through the cascade, and
 * there is no directory to secure, mount or forget. The price is a row
 * that can be twenty megabytes, which is what the upload ceiling in
 * src/modules/files bounds it to.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const files = pgTable(
  "files",
  {
    id: domainId("id"),
    orgId: tenant(),
    /** The flow the file was uploaded for; null for a file the workspace keeps on its own. */
    flowId: text("flow_id").references(() => flows.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    bytes: bytea("bytes").notNull(),
    /** What the document brick reads: the text extracted on upload, or null when nothing could be. */
    text: text("text"),
    /** Why extraction gave nothing, when it did; a person can still see the file. */
    extractError: text("extract_error"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("files_org_created_idx").on(t.orgId, t.createdAt),
    index("files_flow_idx").on(t.flowId),
  ],
);

export type FileRow = typeof files.$inferSelect;
