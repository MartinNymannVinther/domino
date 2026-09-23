import {
  inputPorts,
  loopBody,
  outputPortNames,
  PortIndex,
  type FlowDocument,
  type FlowNode,
} from "@/modules/flow";
import { runBrick, SKIP, type BrickContext, type Outputs } from "./bricks";
import { topologicalOrder } from "./order";
import {
  DEFAULT_ENGINE_LIMITS,
  StepFailure,
  type EngineOptions,
  type RunResult,
  type RunTotals,
  type StepEvent,
  type Value,
} from "./types";

/**
 * Runs a flow: a pure function over the document with the model, the
 * files and the input handed in (CLAUDE.md, architecture). Bricks run in
 * dependency order; a loop runs its body once per item; a branch sends
 * SKIP down the way it did not take. Every step is reported through the
 * hooks as it happens, so whoever runs this can show the pieces fall.
 *
 * Nothing here is retried and nothing is swallowed: the first brick
 * that fails ends the run, named, with what it had in hand already
 * written as its step.
 */

class Stopped extends Error {}
class Failed extends Error {
  constructor(
    readonly nodeId: string,
    readonly iteration: number,
    message: string,
  ) {
    super(message);
  }
}

export async function runFlow(doc: FlowDocument, options: EngineOptions): Promise<RunResult> {
  const limits = { ...DEFAULT_ENGINE_LIMITS, ...options.limits };
  const totals: RunTotals = {
    steps: 0,
    modelCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    failedSteps: 0,
    reusedSteps: 0,
  };
  const prior = options.prior;
  const index = new PortIndex(doc);
  const state = new Map<string, Value | typeof SKIP>();
  const order = topologicalOrder(doc);

  // Which loop a brick belongs to, and where each loop ends.
  const bodyOf = new Map<string, string>();
  const loops = new Map<string, { start: string; end: string; body: Set<string> }>();
  for (const node of doc.nodes) {
    if (node.type !== "loop_start") continue;
    const loop = loopBody(doc, node.config.loopId);
    if (!loop) throw new Error(`loop ${node.config.loopId} is not a pair`);
    loops.set(node.id, loop);
    for (const id of loop.body) bodyOf.set(id, node.id);
    bodyOf.set(loop.end, node.id);
  }

  const ctx: BrickContext = {
    model: options.model,
    readFile: options.readFile,
    input: options.input,
    callsLeft: () => limits.maxModelCalls - totals.modelCalls,
    modelCall: (reply) => {
      totals.modelCalls += 1;
      totals.tokensIn += reply.usage?.inputTokens ?? 0;
      totals.tokensOut += reply.usage?.outputTokens ?? 0;
    },
  };

  const report = async (event: StepEvent) => {
    await options.hooks?.onStep?.(event);
  };

  /** Reads what feeds a brick; SKIP on a required port skips the brick. */
  const gather = (node: FlowNode): { inputs: Map<string, Value>; skipped: boolean } => {
    const inputs = new Map<string, Value>();
    let skipped = false;
    for (const port of inputPorts(node)) {
      const edge = index.edgeInto(node.id, port.name);
      if (!edge) continue;
      const value = state.get(`${edge.from.node}:${edge.from.port}`);
      if (value === undefined) throw new Failed(node.id, 0, `${port.name} was never produced`);
      if (value === SKIP) {
        if (node.type !== "combine") skipped = true;
        continue;
      }
      inputs.set(port.name, value);
    }
    if (node.type === "combine" && inputs.size === 0) skipped = true;
    return { inputs, skipped };
  };

  const record = (node: FlowNode, outputs: Outputs) => {
    for (const [port, value] of Object.entries(outputs)) state.set(`${node.id}:${port}`, value);
  };

  const execute = async (node: FlowNode, iteration: number): Promise<void> => {
    if (await options.hooks?.shouldStop?.()) throw new Stopped();
    totals.steps += 1;
    // A step the earlier run finished is taken as it was: the same
    // values, no model call, and a row saying where it came from.
    const done = prior?.get(`${node.id}:${iteration}`);
    if (done) {
      for (const [port, value] of Object.entries(done)) state.set(`${node.id}:${port}`, value);
      totals.reusedSteps += 1;
      await report({
        nodeId: node.id,
        iteration,
        status: "done",
        output: done,
        reused: true,
        tokensIn: 0,
        tokensOut: 0,
      });
      return;
    }
    if (totals.steps > limits.maxSteps)
      throw new Failed(node.id, iteration, "the run's ceiling on steps is reached");
    const { inputs, skipped } = gather(node);
    const before = { tokensIn: totals.tokensIn, tokensOut: totals.tokensOut };
    const input = Object.fromEntries(inputs);
    if (skipped) {
      record(node, skipAll(node));
      await report({
        nodeId: node.id,
        iteration,
        status: "skipped",
        input,
        tokensIn: 0,
        tokensOut: 0,
      });
      return;
    }
    await report({
      nodeId: node.id,
      iteration,
      status: "running",
      input,
      tokensIn: 0,
      tokensOut: 0,
    });
    try {
      const outputs = await runBrick(node, inputs, ctx);
      record(node, outputs);
      await report({
        nodeId: node.id,
        iteration,
        status: "done",
        input,
        output: visible(outputs),
        tokensIn: totals.tokensIn - before.tokensIn,
        tokensOut: totals.tokensOut - before.tokensOut,
      });
    } catch (error) {
      const message =
        error instanceof StepFailure
          ? error.message
          : error instanceof Error
            ? error.message
            : "the brick failed";
      await report({
        nodeId: node.id,
        iteration,
        status: "failed",
        input,
        error: message,
        tokensIn: totals.tokensIn - before.tokensIn,
        tokensOut: totals.tokensOut - before.tokensOut,
      });
      // "skip" is the brick's own answer to a bad item in a good pile
      // (docs/adr/0014): its outputs stay unfilled, which carries
      // downstream as a skip, and inside a loop leaves this item out.
      if (node.onError === "skip") {
        record(node, skipAll(node));
        totals.failedSteps += 1;
        return;
      }
      throw new Failed(node.id, iteration, message);
    }
  };

  const runLoop = async (start: FlowNode): Promise<void> => {
    const loop = loops.get(start.id)!;
    const end = doc.nodes.find((n) => n.id === loop.end)!;
    const { inputs, skipped } = gather(start);
    totals.steps += 1;
    const items = inputs.get("items");
    if (skipped || !Array.isArray(items)) {
      record(start, { item: SKIP });
      record(end, { items: SKIP });
      await report({
        nodeId: start.id,
        iteration: 0,
        status: "skipped",
        tokensIn: 0,
        tokensOut: 0,
      });
      return;
    }
    await report({
      nodeId: start.id,
      iteration: 0,
      status: "done",
      input: { items },
      output: { count: items.length },
      tokensIn: 0,
      tokensOut: 0,
    });
    const collected: Value[] = [];
    const body = order.filter((n) => loop.body.has(n.id));
    for (const [i, item] of items.entries()) {
      record(start, { item });
      for (const node of body) await execute(node, i);
      const { inputs: endInputs, skipped: endSkipped } = gather(end);
      if (!endSkipped) collected.push(endInputs.get("item") ?? null);
    }
    record(end, { items: collected });
    totals.steps += 1;
    await report({
      nodeId: end.id,
      iteration: 0,
      status: "done",
      output: { items: collected },
      tokensIn: 0,
      tokensOut: 0,
    });
  };

  try {
    for (const node of order) {
      if (bodyOf.has(node.id)) continue;
      if (node.type === "loop_start") await runLoop(node);
      else await execute(node, 0);
    }
  } catch (error) {
    if (error instanceof Stopped)
      return { ok: false, cancelled: true, error: "cancelled", ...totals };
    if (error instanceof Failed)
      return {
        ok: false,
        cancelled: false,
        error: error.message,
        nodeId: error.nodeId,
        iteration: error.iteration,
        ...totals,
      };
    throw error;
  }

  const output: Record<string, Value | null> = {};
  for (const node of doc.nodes) {
    if (node.type !== "output") continue;
    const value = state.get(`${node.id}:value`);
    output[node.id] = value === undefined || value === SKIP ? null : value;
  }
  return { ok: true, output, ...totals };
}

function skipAll(node: FlowNode): Outputs {
  const outputs: Outputs = {};
  for (const port of outputPortNames(node)) outputs[port] = SKIP;
  return outputs;
}

function visible(outputs: Outputs): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [port, value] of Object.entries(outputs)) if (value !== SKIP) out[port] = value;
  return out;
}
