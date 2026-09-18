import { and, desc, eq, inArray } from "drizzle-orm";
import { runs, runSteps } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { RateLimited, reserveAiCall } from "@/modules/ai/limits";
import { workspaceLlmProvider } from "@/modules/ai/model-settings";
import {
  providerAdapter,
  runBrick,
  SKIP,
  StepFailure,
  type BrickContext,
  type ModelAdapter,
  type Value,
} from "@/modules/engine";
import { FileRef, inputPorts, PortIndex } from "@/modules/flow";
import { readFileText } from "@/modules/files/service";
import { getFlow } from "@/modules/flow/service";
import { testableBrick } from "./testable";

/**
 * One brick, tried on its own (CLAUDE.md, never a black box): the
 * person hands it what its inputs would carry — or takes what the last
 * run carried there — and sees what it gives back. Nothing is stored:
 * a probe is not a run. The model call is counted like any assist.
 */

export type BrickTestResult =
  | { ok: true; outputs: Record<string, Value>; tokensIn: number; tokensOut: number; ms: number }
  | { ok: false; error: string; reason: "notFound" | "untestable" | "failed" | "ceiling" };

/** Text from a form, read the way the port would carry it. */
function readGiven(raw: unknown, kind: string | null): Value {
  if (kind === "file") {
    const ref = FileRef.safeParse(raw);
    return ref.success ? ref.data : null;
  }
  if (typeof raw !== "string") return (raw as Value) ?? null;
  const text = raw;
  if (kind === "json" || kind === "list" || kind === "boolean") {
    try {
      return JSON.parse(text) as Value;
    } catch {
      return text;
    }
  }
  return text;
}

export async function testBrick(
  ctx: OrgContext,
  flowId: string,
  nodeId: string,
  given: Record<string, unknown>,
): Promise<BrickTestResult> {
  const flow = await getFlow(ctx, flowId);
  const node = flow?.document.nodes.find((n) => n.id === nodeId);
  if (!flow || !node) return { ok: false, reason: "notFound", error: "no such brick" };
  if (!testableBrick(node.type))
    return { ok: false, reason: "untestable", error: "not on its own" };

  const index = new PortIndex(flow.document);
  const inputs = new Map<string, Value>();
  for (const port of inputPorts(node)) {
    if (!(port.name in given)) continue;
    const kind = index.incomingKind(node.id, port.name)?.kind ?? port.kind?.kind ?? null;
    const value = readGiven(given[port.name], kind);
    if (value !== null && value !== "") inputs.set(port.name, value);
  }

  const provider = await workspaceLlmProvider(ctx);
  const model = provider ? counted(providerAdapter(provider), ctx) : null;
  let tokensIn = 0;
  let tokensOut = 0;
  let calls = 0;
  const brickCtx: BrickContext = {
    model,
    readFile: (fileId) => readFileText(ctx, fileId),
    input: {},
    callsLeft: () => 4 - calls,
    modelCall: (reply) => {
      calls += 1;
      tokensIn += reply.usage?.inputTokens ?? 0;
      tokensOut += reply.usage?.outputTokens ?? 0;
    },
  };
  const started = Date.now();
  try {
    const raw = await runBrick(node, inputs, brickCtx);
    const outputs: Record<string, Value> = {};
    for (const [port, value] of Object.entries(raw)) if (value !== SKIP) outputs[port] = value;
    return { ok: true, outputs, tokensIn, tokensOut, ms: Date.now() - started };
  } catch (error) {
    if (error instanceof RateLimited) return { ok: false, reason: "ceiling", error: "ceiling" };
    const message =
      error instanceof StepFailure || error instanceof Error ? error.message : "the brick failed";
    return { ok: false, reason: "failed", error: message.slice(0, 2000) };
  }
}

function counted(adapter: ModelAdapter, ctx: OrgContext): ModelAdapter {
  return {
    engine: adapter.engine,
    async complete(request) {
      await withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, "test", adapter.engine));
      return adapter.complete(request);
    },
  };
}

/**
 * What the last run carried to a brick's inputs, keyed by port: the
 * output of the brick each edge comes from, first time round. Empty
 * where no run has been, or the brick was skipped.
 */
export async function lastInputsFor(
  ctx: OrgContext,
  flowId: string,
  nodeId: string,
): Promise<Record<string, Value>> {
  const flow = await getFlow(ctx, flowId);
  const node = flow?.document.nodes.find((n) => n.id === nodeId);
  if (!flow || !node) return {};
  const index = new PortIndex(flow.document);
  const wanted = inputPorts(node)
    .map((p) => ({ port: p.name, edge: index.edgeInto(node.id, p.name) }))
    .filter((w) => w.edge);
  if (wanted.length === 0) return {};
  const sources = [...new Set(wanted.map((w) => w.edge!.from.node))];
  return withOrgContext(ctx, async (tx) => {
    const [run] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.flowId, flowId), inArray(runs.status, ["done", "failed", "cancelled"])))
      .orderBy(desc(runs.createdAt))
      .limit(1);
    if (!run) return {};
    const steps = await tx
      .select({ nodeId: runSteps.nodeId, output: runSteps.output })
      .from(runSteps)
      .where(
        and(
          eq(runSteps.runId, run.id),
          eq(runSteps.iteration, 0),
          eq(runSteps.status, "done"),
          inArray(runSteps.nodeId, sources),
        ),
      );
    const found: Record<string, Value> = {};
    for (const w of wanted) {
      const step = steps.find((s) => s.nodeId === w.edge!.from.node);
      const output = step?.output as Record<string, Value> | null | undefined;
      const value = output?.[w.edge!.from.port];
      if (value !== undefined && value !== null) found[w.port] = value;
    }
    return found;
  });
}
