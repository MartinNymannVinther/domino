import { parseModelJson } from "@/modules/ai/parse-json";
import { COMBINE_PORTS, schemaProblems, type FlowNode, type RunInput } from "@/modules/flow";
import { fillTemplate, jsonRequest, textRequest } from "./prompt";
import {
  StepFailure,
  type FileReader,
  type JsonObject,
  type ModelAdapter,
  type Value,
} from "./types";
import { isEmpty, isFileRef, isObject, readPath, toNumber, toText } from "./values";

/**
 * What each brick does with what it is handed (docs/flow-format.md).
 * A brick reads its inputs by port name, answers with its outputs by
 * port name, and throws a StepFailure when it cannot; the engine in
 * run.ts decides the order, the loops and the record.
 *
 * SKIP on an output port is the branch's word for "not this way", and
 * the engine carries it downstream: a brick handed SKIP on a required
 * input is skipped itself, a combine drops it, a loop end leaves it out.
 */

export const SKIP = Symbol("skip");
export type Outputs = Record<string, Value | typeof SKIP>;

export type BrickContext = {
  model: ModelAdapter | null;
  readFile: FileReader;
  input: RunInput;
  /** Counts a model call against the run's ceiling, or throws. */
  modelCall: (reply: { usage: { inputTokens: number; outputTokens: number } | null }) => void;
  /** Model calls left; a brick that would need more than it has stops before asking. */
  callsLeft: () => number;
};

export async function runBrick(
  node: FlowNode,
  inputs: Map<string, Value>,
  ctx: BrickContext,
): Promise<Outputs> {
  switch (node.type) {
    case "input":
      return { value: ctx.input[node.id] ?? null };
    case "document":
      return { text: await readDocument(inputs.get("file"), node.config.maxChars, ctx) };
    case "llm":
      return { text: await askText(node, inputs, ctx) };
    case "structured":
      return { json: await askJson(node, inputs, ctx) };
    case "template":
      return { text: fillTemplate(node.config.template, inputs) };
    case "branch":
      return branch(node, inputs.get("value") ?? null);
    case "combine":
      return combine(node, inputs);
    case "output":
      return { value: inputs.get("value") ?? null };
    case "loop_start":
    case "loop_end":
      // The engine runs loops itself; a loop brick reaching here is a bug in run.ts.
      throw new StepFailure("loop bricks are run by the engine");
  }
}

async function readDocument(
  file: Value | undefined,
  maxChars: number,
  ctx: BrickContext,
): Promise<string> {
  if (!file || !isFileRef(file)) throw new StepFailure("no file to read");
  const read = await ctx.readFile(file.fileId);
  if ("error" in read) throw new StepFailure(`${file.name}: ${read.error}`);
  return read.text.length > maxChars ? read.text.slice(0, maxChars) : read.text;
}

function requireModel(ctx: BrickContext): ModelAdapter {
  if (!ctx.model) throw new StepFailure("no model is configured for this workspace");
  if (ctx.callsLeft() <= 0) throw new StepFailure("the run's ceiling on model calls is reached");
  return ctx.model;
}

async function askText(
  node: Extract<FlowNode, { type: "llm" }>,
  inputs: Map<string, Value>,
  ctx: BrickContext,
): Promise<string> {
  const model = requireModel(ctx);
  const reply = await model.complete(textRequest(node.config.prompt, inputs, node.config));
  ctx.modelCall(reply);
  return reply.content.trim();
}

/**
 * One answer, checked against the schema; one more try with the
 * problems named when it does not conform. Two is the whole budget: a
 * model that cannot fill a form in two goes will not in ten, and the
 * failure then says what it kept getting wrong.
 */
async function askJson(
  node: Extract<FlowNode, { type: "structured" }>,
  inputs: Map<string, Value>,
  ctx: BrickContext,
): Promise<JsonObject> {
  const model = requireModel(ctx);
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && ctx.callsLeft() <= 0) break;
    const reply = await model.complete(
      jsonRequest(node.config.prompt, node.config.schema, inputs, node.config, problems),
    );
    ctx.modelCall(reply);
    const parsed = parseModelJson(reply.content);
    if (parsed === null) {
      problems = ["the answer was not JSON"];
      continue;
    }
    problems = schemaProblems(node.config.schema, parsed);
    if (problems.length === 0) return parsed as JsonObject;
  }
  throw new StepFailure(`the model's answer did not fit the schema: ${problems.join("; ")}`);
}

function branch(node: Extract<FlowNode, { type: "branch" }>, value: Value): Outputs {
  const { op, field, value: expected } = node.config.condition;
  const looked = field ? readPath(value, field.split(".")) : value;
  let yes: boolean;
  switch (op) {
    case "notEmpty":
      yes = !isEmpty(looked);
      break;
    case "equals":
      yes = toText(looked).trim().toLowerCase() === expected.trim().toLowerCase();
      break;
    case "contains":
      yes = toText(looked).toLowerCase().includes(expected.trim().toLowerCase());
      break;
    case "gt":
    case "lt": {
      const left = toNumber(looked);
      const right = toNumber(expected);
      yes = left !== null && right !== null && (op === "gt" ? left > right : left < right);
      break;
    }
  }
  return yes ? { yes: value, no: SKIP } : { yes: SKIP, no: value };
}

function combine(
  node: Extract<FlowNode, { type: "combine" }>,
  inputs: Map<string, Value>,
): Outputs {
  const present = COMBINE_PORTS.filter((p) => inputs.has(p)).map(
    (p) => [p, inputs.get(p)!] as const,
  );
  if (present.length === 0) throw new StepFailure("nothing reached the combine brick");
  switch (node.config.mode) {
    case "concat":
      return { text: present.map(([, v]) => toText(v)).join(node.config.separator) };
    case "merge": {
      // Objects merge; anything else is kept under the letter of its port.
      const merged: JsonObject = {};
      for (const [port, value] of present) {
        if (isObject(value)) Object.assign(merged, value);
        else merged[port] = value;
      }
      return { json: merged };
    }
    case "list":
      // Lists flatten one level: two piles become one pile, not a pile of piles.
      return { list: present.flatMap(([, v]) => (Array.isArray(v) ? v : [v])) };
  }
}
