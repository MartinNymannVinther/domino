import { z } from "zod";
import { StructuredSchema } from "./json-schema";
import { Id, NODE_TYPES } from "./kinds";

/**
 * The executable half of docs/flow-format.md: the shape of a document.
 * This file says what a document may contain; `validate.ts` says whether
 * what it contains holds together (ports connected, kinds matching,
 * loops paired). Both run before anything is stored, drawn or run.
 */

export const FORMAT = "domino.flow";
export const FORMAT_VERSION = 1;

/** Ceilings that keep a document a document and not a novel. */
export const LIMITS = {
  nodes: 200,
  edges: 400,
  name: 120,
  description: 2000,
  title: 80,
  prompt: 20_000,
  template: 20_000,
  label: 80,
  hint: 300,
  note: 500,
  documentChars: 200_000,
  combineInputs: 8,
} as const;

const Prompt = z.string().min(1).max(LIMITS.prompt);
const Temperature = z.number().min(0).max(1).default(0.2);
const MaxTokens = z.number().int().min(1).max(8000).default(1000);

export const INPUT_KINDS = ["text", "file", "list"] as const;
export const OUTPUT_KINDS = ["text", "table", "json"] as const;
export const BRANCH_OPS = ["contains", "equals", "notEmpty", "gt", "lt"] as const;
export const COMBINE_MODES = ["concat", "merge", "list"] as const;

export const InputConfig = z.object({
  kind: z.enum(INPUT_KINDS),
  /** For a list: what the items are. Files by default, the ordinary pile. */
  itemKind: z.enum(["file", "text"]).default("file"),
  label: z.string().min(1).max(LIMITS.label),
  hint: z.string().max(LIMITS.hint).default(""),
});

export const LlmConfig = z.object({
  prompt: Prompt,
  temperature: Temperature,
  maxTokens: MaxTokens,
});

export const StructuredConfig = z.object({
  prompt: Prompt,
  schema: StructuredSchema,
  temperature: z.number().min(0).max(1).default(0),
  maxTokens: MaxTokens,
});

export const DocumentConfig = z.object({
  maxChars: z.number().int().min(100).max(LIMITS.documentChars).default(60_000),
});

export const BranchConfig = z.object({
  condition: z.object({
    op: z.enum(BRANCH_OPS),
    /** What the input is compared with; unused by notEmpty. */
    value: z.string().max(500).default(""),
    /** For a json input: which field is looked at. Empty means the whole value. */
    field: z.string().max(120).default(""),
  }),
});

export const LoopConfig = z.object({ loopId: Id });

export const CombineConfig = z.object({
  mode: z.enum(COMBINE_MODES),
  separator: z.string().max(100).default("\n\n"),
});

export const TemplateConfig = z.object({
  template: z.string().min(1).max(LIMITS.template),
});

export const OutputConfig = z.object({
  kind: z.enum(OUTPUT_KINDS),
  label: z.string().min(1).max(LIMITS.label),
});

/** What a brick does when it fails: end the run, or leave this one out and go on. */
export const ON_ERROR = ["stop", "skip"] as const;
export type OnError = (typeof ON_ERROR)[number];

/**
 * Every brick carries these beside its type's own config. Both are
 * optional with a default, so a document written before they existed
 * still reads (docs/flow-format.md).
 */
const base = {
  id: Id,
  title: z.string().min(1).max(LIMITS.title),
  /** "skip" leaves the brick's outputs unfilled and carries on; inside a loop, that item is left out. */
  onError: z.enum(ON_ERROR).default("stop"),
  /** A note to whoever reads the flow next, drawn on the brick. */
  note: z.string().max(LIMITS.note).default(""),
};

export const FlowNode = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("input"), config: InputConfig }),
  z.object({ ...base, type: z.literal("llm"), config: LlmConfig }),
  z.object({ ...base, type: z.literal("structured"), config: StructuredConfig }),
  z.object({ ...base, type: z.literal("document"), config: DocumentConfig }),
  z.object({ ...base, type: z.literal("branch"), config: BranchConfig }),
  z.object({ ...base, type: z.literal("loop_start"), config: LoopConfig }),
  z.object({ ...base, type: z.literal("loop_end"), config: LoopConfig }),
  z.object({ ...base, type: z.literal("combine"), config: CombineConfig }),
  z.object({ ...base, type: z.literal("template"), config: TemplateConfig }),
  z.object({ ...base, type: z.literal("output"), config: OutputConfig }),
]);
export type FlowNode = z.infer<typeof FlowNode>;
export type FlowNodeOf<T extends FlowNode["type"]> = Extract<FlowNode, { type: T }>;
export type NodeConfig<T extends FlowNode["type"]> = FlowNodeOf<T>["config"];

/** A port name: a plain one (`text`) or a reference one (`n2.text`). */
const PortName = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/, "port");

export const PortRef = z.object({ node: Id, port: PortName });
export type PortRef = z.infer<typeof PortRef>;

export const FlowEdge = z.object({ id: Id, from: PortRef, to: PortRef });
export type FlowEdge = z.infer<typeof FlowEdge>;

export const FlowDocument = z.object({
  format: z.literal(FORMAT),
  version: z.literal(FORMAT_VERSION),
  name: z.string().min(1).max(LIMITS.name),
  description: z.string().max(LIMITS.description).default(""),
  nodes: z.array(FlowNode).min(1).max(LIMITS.nodes),
  edges: z.array(FlowEdge).max(LIMITS.edges).default([]),
});
export type FlowDocument = z.infer<typeof FlowDocument>;

/** The node types, for the canvas palette and the model's instructions. */
export { NODE_TYPES };
