import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { domainId, organizations, users } from "./foundation";

const tenant = () =>
  text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/**
 * One row per model call, so calls per person and per workspace can be
 * counted and capped. Kept short: no content, only who, what kind, when.
 */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: domainId("id"),
    orgId: tenant(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // draft | split | summary | test
    engine: text("engine").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_calls_user_created_idx").on(t.userId, t.createdAt)],
);

/**
 * The model this workspace uses, when it does not want the one the
 * installation set. One row per workspace, absent until somebody chooses:
 * absence means "inherit the installation", which is the honest default
 * for a tool that must also run with no model at all.
 *
 * The API key is stored encrypted (AES-256-GCM, see src/core/crypto) and
 * never leaves the server; the settings page can say a key is stored and
 * when it was stored, and nothing more. The Ollama address is deliberately
 * not here: a workspace picking its own URL would be a request the server
 * makes to wherever a member points it, and that is a hole nobody asked
 * for. The installation owns the address; the workspace owns the model.
 */
export const workspaceLlmSettings = pgTable("workspace_llm_settings", {
  id: domainId("id"),
  orgId: tenant().unique(),
  /** mistral | ollama | none — "none" is a deliberate opt-out, not absence. */
  provider: text("provider").notNull(),
  /** Null means the provider's own default model. */
  model: text("model"),
  /** Versioned ciphertext, or null when the installation's key is used. */
  apiKeyCipher: text("api_key_cipher"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkspaceLlmSettingsRow = typeof workspaceLlmSettings.$inferSelect;
