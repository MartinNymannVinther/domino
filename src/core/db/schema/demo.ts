import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./foundation";

/**
 * Which workspaces are demos, and when they stop being anything. A demo
 * is an ordinary workspace in every other respect — same tables, same
 * policies, same code path — so what is demonstrated is the product and
 * not a mock of it. This table is the only difference: a row here means
 * "throw this away at that time".
 *
 * It is installation state rather than workspace data: the application
 * role never reads it, so it carries no org_id and no RLS policy. The
 * cleanup runs as the migration role, the way the roles script does.
 */
export const demoWorkspaces = pgTable(
  "demo_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The throwaway account the visitor is signed in as. */
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("demo_workspaces_expires_at_idx").on(table.expiresAt)],
);

export type DemoWorkspace = typeof demoWorkspaces.$inferSelect;
