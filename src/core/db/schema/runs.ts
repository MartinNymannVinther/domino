import { sql } from "drizzle-orm";
import { check, index, integer, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { flows, flowVersions } from "./flows";
import { tenant } from "./shared";

/**
 * What happened when a flow ran (docs/adr/0011).
 *
 * A run is pinned to the version it ran, so the history still reads
 * right after the flow has changed. Every brick the engine touched
 * writes one `run_steps` row per iteration with what went in and what
 * came out, as it happens, so a person watching sees the pieces fall
 * one by one and a failed run says which brick, with what in hand.
 * Nothing is a black box: the steps are the record, and the run's
 * totals are summed from them.
 */

/** One example through the flow before the whole pile, or the whole pile. */
export const RUN_MODES = ["test", "full"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const RUN_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const STEP_STATUSES = ["running", "done", "failed", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const runs = pgTable(
  "runs",
  {
    id: domainId("id"),
    orgId: tenant(),
    flowId: text("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => flowVersions.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("full"),
    status: text("status").notNull().default("queued"),
    /** The values given to the input bricks, keyed by node id. */
    input: json("input").notNull().default({}),
    /** What the output bricks produced, keyed by node id; null until the run is done. */
    output: json("output"),
    /** Why the run failed, in the engine's words; the AI's explanation is asked for separately. */
    error: text("error"),
    /** Which engine answered the model calls, so the history says whose numbers these are. */
    engine: text("engine").notNull().default(""),
    stepCount: integer("step_count").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("runs_flow_created_idx").on(t.flowId, t.createdAt),
    // The runner claims queued rows oldest first (src/modules/runs/runner).
    index("runs_status_created_idx").on(t.status, t.createdAt),
    check("runs_mode_ck", sql`${t.mode} in ('test', 'full')`),
    check(
      "runs_status_ck",
      sql`${t.status} in ('queued', 'running', 'done', 'failed', 'cancelled')`,
    ),
  ],
);

export const runSteps = pgTable(
  "run_steps",
  {
    id: domainId("id"),
    orgId: tenant(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    /** The brick, by its id in the flow document. */
    nodeId: text("node_id").notNull(),
    /** Which time round inside a loop; 0 outside one. */
    iteration: integer("iteration").notNull().default(0),
    status: text("status").notNull().default("running"),
    input: json("input"),
    output: json("output"),
    error: text("error"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("run_steps_run_started_idx").on(t.runId, t.startedAt),
    check("run_steps_status_ck", sql`${t.status} in ('running', 'done', 'failed', 'skipped')`),
  ],
);

export type RunRow = typeof runs.$inferSelect;
export type RunStepRow = typeof runSteps.$inferSelect;
