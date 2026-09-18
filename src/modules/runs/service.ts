import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  flows,
  runs,
  runSteps,
  type RunMode,
  type RunStatus,
  type StepStatus,
} from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { filesExist } from "@/modules/files/service";
import {
  itemCount,
  RUN_LIMITS,
  validateDocument,
  validateRunInput,
  type FlowDocument,
  type RunInput,
} from "@/modules/flow";
import { getFlow } from "@/modules/flow/service";

/**
 * Runs as records (docs/adr/0011): queued with the input a person gave,
 * pinned to the version they ran, claimed by the runner, written step
 * by step. Everything here runs in the workspace context; the one thing
 * that does not — taking the next queued run off the pile — is the
 * runner's definer function (drizzle/0005).
 */

export type RunSummary = {
  id: string;
  flowId: string;
  versionId: string;
  mode: RunMode;
  status: RunStatus;
  error: string | null;
  engine: string;
  stepCount: number;
  tokensIn: number;
  tokensOut: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type RunStep = {
  id: string;
  nodeId: string;
  iteration: number;
  status: StepStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  startedAt: Date;
  finishedAt: Date | null;
};

export type RunView = RunSummary & {
  input: RunInput;
  output: Record<string, unknown> | null;
  document: FlowDocument;
  flowName: string;
  steps: RunStep[];
};

export type StartResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "notFound" | "unfinished" | "invalidInput" | "tooManyItems" | "unknownFile";
      problems?: Array<{ nodeId: string; message: string }>;
    };

/**
 * A new run, queued. The input is validated against the flow's input
 * bricks, every file is looked up in the workspace, a flow with loose
 * ends is refused (docs/adr/0012), and a test run keeps one item of
 * every pile so the whole flow is seen once before the bill.
 */
export async function startRun(
  ctx: OrgContext,
  flowId: string,
  mode: RunMode,
  rawInput: unknown,
): Promise<StartResult> {
  const flow = await getFlow(ctx, flowId);
  if (!flow) return { ok: false, reason: "notFound" };
  // Loose ends are kept on the canvas and refused here (docs/adr/0012).
  if (validateDocument(flow.document).length) return { ok: false, reason: "unfinished" };
  const validated = validateRunInput(flow.document, rawInput);
  if (!validated.ok) return { ok: false, reason: "invalidInput", problems: validated.problems };
  const input = mode === "test" ? firstOfEachPile(validated.input) : validated.input;
  if (itemCount(input) > RUN_LIMITS.itemsPerRun) return { ok: false, reason: "tooManyItems" };
  if (!(await filesExist(ctx, fileIdsIn(input)))) return { ok: false, reason: "unknownFile" };
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .insert(runs)
      .values({
        orgId: ctx.orgId,
        flowId,
        versionId: flow.version.id,
        mode,
        status: "queued",
        input,
        createdBy: ctx.userId,
      })
      .returning({ id: runs.id }),
  );
  return { ok: true, runId: row!.id };
}

function firstOfEachPile(input: RunInput): RunInput {
  const out: RunInput = {};
  for (const [key, value] of Object.entries(input))
    out[key] = Array.isArray(value) ? value.slice(0, 1) : value;
  return out;
}

function fileIdsIn(input: RunInput): string[] {
  const ids: string[] = [];
  for (const value of Object.values(input)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "object" && item !== null && "fileId" in item) ids.push(item.fileId);
    }
  }
  return ids;
}

export async function listRuns(ctx: OrgContext, flowId: string): Promise<RunSummary[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select(summaryColumns)
      .from(runs)
      .where(eq(runs.flowId, flowId))
      .orderBy(desc(runs.createdAt))
      .limit(200),
  );
}

/** The newest run per flow, for the list: what happened last. */
export async function lastRuns(ctx: OrgContext): Promise<Map<string, RunSummary>> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .select(summaryColumns)
      .from(runs)
      .where(
        inArray(
          runs.id,
          tx
            .select({ id: sql<string>`distinct on (${runs.flowId}) ${runs.id}` })
            .from(runs)
            .orderBy(runs.flowId, desc(runs.createdAt)),
        ),
      ),
  );
  return new Map(rows.map((r) => [r.flowId, r]));
}

export async function getRun(ctx: OrgContext, runId: string): Promise<RunView | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ run: runs, flowName: flows.name })
      .from(runs)
      .innerJoin(flows, eq(flows.id, runs.flowId))
      .where(eq(runs.id, runId))
      .limit(1);
    if (!row) return null;
    const [version] = await tx
      .execute(sql`select document from flow_versions where id = ${row.run.versionId} limit 1`)
      .then((r) => r.rows as Array<{ document: FlowDocument }>);
    const steps = await tx
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .orderBy(asc(runSteps.startedAt), asc(runSteps.id));
    return {
      ...summarize(row.run),
      input: row.run.input as RunInput,
      output: (row.run.output as Record<string, unknown> | null) ?? null,
      document: version!.document,
      flowName: row.flowName,
      steps: steps.map((s) => ({ ...s, status: s.status as StepStatus })),
    };
  });
}

/** Asks a run to stop: a queued one stops here, a running one when the engine next looks. */
export async function cancelRun(ctx: OrgContext, runId: string): Promise<boolean> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .update(runs)
      .set({
        status: "cancelled",
        finishedAt: sql`case when ${runs.status} = 'queued' then now() else ${runs.finishedAt} end`,
      })
      .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running"])))
      .returning({ id: runs.id }),
  );
  return rows.length > 0;
}

const summaryColumns = {
  id: runs.id,
  flowId: runs.flowId,
  versionId: runs.versionId,
  mode: sql<RunMode>`${runs.mode}`,
  status: sql<RunStatus>`${runs.status}`,
  error: runs.error,
  engine: runs.engine,
  stepCount: runs.stepCount,
  tokensIn: runs.tokensIn,
  tokensOut: runs.tokensOut,
  startedAt: runs.startedAt,
  finishedAt: runs.finishedAt,
  createdAt: runs.createdAt,
};

function summarize(row: typeof runs.$inferSelect): RunSummary {
  return {
    id: row.id,
    flowId: row.flowId,
    versionId: row.versionId,
    mode: row.mode as RunMode,
    status: row.status as RunStatus,
    error: row.error,
    engine: row.engine,
    stepCount: row.stepCount,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}
