import { text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./foundation";

/**
 * The two column sets every product table starts with: the workspace it
 * belongs to, cascading from the organization so deleting a workspace
 * deletes everything it owns, and the timestamps.
 */
export const tenant = () =>
  text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
