import { eq, sql } from "drizzle-orm";
import { appDb } from "@/core/db/client";
import { runs, runSteps } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { RateLimited, reserveRunCall } from "@/modules/ai/limits";
import { workspaceLlmProvider } from "@/modules/ai/model-settings";
import { providerAdapter, runFlow, type ModelAdapter, type StepEvent } from "@/modules/engine";
import { readFileText } from "@/modules/files/service";
import { parseDocument, type RunInput } from "@/modules/flow";
import { RUN_CEILINGS } from "./ceilings";

/**
 * The runner (CLAUDE.md, architecture): claims the oldest queued run
 * with FOR UPDATE SKIP LOCKED — through the definer function, since it
 * has no workspace until it has a run — then works inside that
 * workspace's context: the flow's pinned version, the workspace's
 * model, its files, and one `run_steps` row per step as it happens.
 * No queue dependency; one process, polling.
 */

const POLL_MS = 2000;

export type Claimed = { id: string; org_id: string; created_by: string | null };

export async function claimNextRun(): Promise<Claimed | null> {
  const result = await appDb.execute(sql`select * from claim_next_run()`);
  const [row] = result.rows as Claimed[];
  return row ?? null;
}

/** Runs one claimed run to its end. Exported so the tests can drive it without the loop. */
export async function performRun(claimed: Claimed): Promise<void> {
  // A run made by a person who has since left still runs in the
  // workspace's name; the context needs a user id only for the audit.
  const ctx: OrgContext = { orgId: claimed.org_id, userId: claimed.created_by ?? "runner" };
  const loaded = await withOrgContext(ctx, async (tx) => {
    const [run] = await tx.select().from(runs).where(eq(runs.id, claimed.id)).limit(1);
    if (!run) return null;
    const version = await tx
      .execute(sql`select document from flow_versions where id = ${run.versionId} limit 1`)
      .then((r) => (r.rows as Array<{ document: unknown }>)[0]);
    return { run, document: version?.document };
  });
  if (!loaded) return;
  const parsed = parseDocument(loaded.document);
  if (!parsed.ok) {
    await finish(ctx, claimed.id, {
      status: "failed",
      error: "the flow's version no longer reads",
    });
    return;
  }

  const provider = await workspaceLlmProvider(ctx);
  const model = provider ? counted(providerAdapter(provider), ctx) : null;
  const stepRows = new Map<string, string>();

  const result = await runFlow(parsed.document, {
    model,
    readFile: (fileId) => readFileText(ctx, fileId),
    input: loaded.run.input as RunInput,
    limits: { maxSteps: RUN_CEILINGS.stepsPerRun, maxModelCalls: RUN_CEILINGS.modelCallsPerRun },
    hooks: {
      onStep: (event) => writeStep(ctx, claimed.id, event, stepRows),
      shouldStop: async () => {
        const [row] = await withOrgContext(ctx, (tx) =>
          tx.select({ status: runs.status }).from(runs).where(eq(runs.id, claimed.id)).limit(1),
        );
        return row?.status === "cancelled";
      },
    },
  });

  await finish(ctx, claimed.id, {
    status: result.ok ? "done" : result.cancelled ? "cancelled" : "failed",
    error: result.ok ? null : result.cancelled ? null : errorLine(result),
    output: result.ok ? result.output : null,
    engine: model?.engine ?? "",
    stepCount: stepRows.size,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });
}

function errorLine(result: { error: string; nodeId?: string; iteration?: number }): string {
  const where = result.nodeId
    ? `${result.nodeId}${result.iteration ? `#${result.iteration + 1}` : ""}: `
    : "";
  return `${where}${result.error}`.slice(0, 2000);
}

/** The workspace's model, with every call counted against the ceilings first. */
function counted(adapter: ModelAdapter, ctx: OrgContext): ModelAdapter {
  return {
    engine: adapter.engine,
    async complete(request) {
      try {
        await withOrgContext(ctx, (tx) => reserveRunCall(tx, ctx, adapter.engine));
      } catch (error) {
        if (error instanceof RateLimited)
          throw new Error("the workspace's ceiling on model calls for today is reached");
        throw error;
      }
      return adapter.complete(request);
    },
  };
}

async function writeStep(
  ctx: OrgContext,
  runId: string,
  event: StepEvent,
  rows: Map<string, string>,
): Promise<void> {
  const key = `${event.nodeId}:${event.iteration}`;
  await withOrgContext(ctx, async (tx) => {
    const existing = rows.get(key);
    if (event.status === "running" || !existing) {
      const [row] = await tx
        .insert(runSteps)
        .values({
          orgId: ctx.orgId,
          runId,
          nodeId: event.nodeId,
          iteration: event.iteration,
          status: event.status,
          input: event.input ?? null,
          output: event.output ?? null,
          error: event.error ?? null,
          tokensIn: event.tokensIn,
          tokensOut: event.tokensOut,
          // Both stamps from this clock: the database's now() and the
          // host's can differ by more than a step takes.
          startedAt: new Date(),
          finishedAt: event.status === "running" ? null : new Date(),
        })
        .returning({ id: runSteps.id });
      rows.set(key, row!.id);
      return;
    }
    await tx
      .update(runSteps)
      .set({
        status: event.status,
        output: event.output ?? null,
        error: event.error ?? null,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        finishedAt: new Date(),
      })
      .where(eq(runSteps.id, existing));
  });
}

async function finish(
  ctx: OrgContext,
  runId: string,
  patch: {
    status: "done" | "failed" | "cancelled";
    error?: string | null;
    output?: unknown;
    engine?: string;
    stepCount?: number;
    tokensIn?: number;
    tokensOut?: number;
  },
): Promise<void> {
  await withOrgContext(ctx, (tx) =>
    tx
      .update(runs)
      .set({ ...patch, finishedAt: new Date() })
      .where(eq(runs.id, runId)),
  );
}

/** One pass: claim and run what is queued, one at a time, until the pile is empty. */
export async function runQueued(): Promise<number> {
  let n = 0;
  for (;;) {
    const claimed = await claimNextRun();
    if (!claimed) return n;
    n += 1;
    try {
      await performRun(claimed);
    } catch (error) {
      console.error("runner: run failed unexpectedly", claimed.id, error);
      await finish({ orgId: claimed.org_id, userId: claimed.created_by ?? "runner" }, claimed.id, {
        status: "failed",
        error: "the runner failed unexpectedly",
      }).catch(() => undefined);
    }
  }
}

let started = false;

/** Starts the polling loop, once per process. Runs left running by a previous process are failed first. */
export function startRunner(): void {
  if (started) return;
  started = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runQueued();
    } catch (error) {
      console.error("runner: poll failed", error);
    } finally {
      busy = false;
    }
  };
  appDb
    .execute(sql`select fail_interrupted_runs() as n`)
    .then((r) => {
      const n = Number((r.rows[0] as { n?: string | number })?.n ?? 0);
      if (n > 0) console.warn(`runner: failed ${n} run(s) interrupted by a restart`);
    })
    .catch((error) => console.error("runner: could not check for interrupted runs", error))
    .finally(() => {
      void tick();
      setInterval(() => void tick(), POLL_MS).unref();
    });
}
