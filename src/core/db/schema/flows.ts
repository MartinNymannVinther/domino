import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { tenant, timestamps } from "./shared";

/**
 * The flow and everything that changes it (docs/adr/0011, docs/flow-format.md).
 *
 * A flow is one versioned JSON document. The canvas draws it, the engine
 * runs it, export hands it out, import takes it in. Every change — a
 * person's edit on the canvas, an AI proposal the person accepted, an
 * undo — is a patch applied to the previous version and stored as a new
 * row in `flow_versions` with the whole document beside the patch, so a
 * version can be read without replaying anything and a patch can be
 * shown as a diff without computing one.
 *
 * Every table carries `org_id` with a cascading foreign key to the
 * workspace, so deleting a workspace deletes everything it owns, and RLS
 * keys on the same column.
 */

/** Who wrote a version: a person on the canvas, or the model through a proposal a person accepted. */
export const ACTOR_KINDS = ["user", "ai"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** Where an AI proposal stands: waiting on the canvas, taken in, or turned down. */
export const PROPOSAL_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const flows = pgTable(
  "flows",
  {
    id: domainId("id"),
    orgId: tenant(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /**
     * The version the canvas shows and a run uses. Null only between the
     * insert of the flow and its first version, inside one transaction.
     */
    currentVersionId: text("current_version_id").references((): AnyPgColumn => flowVersions.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("flows_org_created_idx").on(t.orgId, t.createdAt)],
);

export const flowVersions = pgTable(
  "flow_versions",
  {
    id: domainId("id"),
    orgId: tenant(),
    flowId: text("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    /** 1, 2, 3 … per flow; handed out inside the write's transaction. */
    number: integer("number").notNull(),
    /** The whole FlowDocument at this version, validated by the format's schema before it is written. */
    document: json("document").notNull(),
    /** The patch that took the previous version here; null on the first version. */
    patch: json("patch"),
    actorKind: text("actor_kind").notNull().default("user"),
    /** A short line on what changed, in the actor's words. */
    message: text("message").notNull().default(""),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("flow_versions_flow_number_uq").on(t.flowId, t.number),
    index("flow_versions_org_idx").on(t.orgId),
    check("flow_versions_actor_kind_ck", sql`${t.actorKind} in ('user', 'ai')`),
  ],
);

/**
 * The conversation about a flow. A person's line is stored as written;
 * the model's reply carries its proposal — a patch against the version
 * it was written for — until the person accepts it (a new version is
 * made and `result_version_id` names it) or turns it down. A reply with
 * no proposal is an answer, nothing more.
 */
export const flowMessages = pgTable(
  "flow_messages",
  {
    id: domainId("id"),
    orgId: tenant(),
    flowId: text("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    /** user | assistant */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Which engine answered; empty for a person's line. */
    engine: text("engine").notNull().default(""),
    /** { baseVersionId, patch } or null. */
    proposal: json("proposal"),
    proposalStatus: text("proposal_status"),
    resultVersionId: text("result_version_id").references(() => flowVersions.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flow_messages_flow_created_idx").on(t.flowId, t.createdAt),
    check("flow_messages_role_ck", sql`${t.role} in ('user', 'assistant')`),
    check(
      "flow_messages_proposal_status_ck",
      sql`${t.proposalStatus} is null or ${t.proposalStatus} in ('proposed', 'accepted', 'rejected')`,
    ),
  ],
);

export type FlowRow = typeof flows.$inferSelect;
export type FlowVersionRow = typeof flowVersions.$inferSelect;
export type FlowMessageRow = typeof flowMessages.$inferSelect;
