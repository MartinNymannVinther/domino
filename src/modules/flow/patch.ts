import { z } from "zod";
import { Id } from "./kinds";
import type { Problem } from "./problems";
import { FlowDocument, FlowEdge, FlowNode, LIMITS } from "./schema";
import { validateDocument } from "./validate";

/**
 * A change to a flow, in the document's own words (docs/flow-format.md,
 * docs/adr/0011). Six operations, each a sentence, so a model can write
 * one reliably, zod can validate all of it, and the canvas can draw it
 * as a diff without computing one. Applying is a pure function: the
 * same document and patch always give the same result, or the same
 * refusal naming the operation that failed.
 */

const NodeUpdate = z.object({
  op: z.literal("updateNode"),
  id: Id,
  title: z.string().min(1).max(LIMITS.title).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PatchOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addNode"), node: FlowNode }),
  NodeUpdate,
  z.object({ op: z.literal("removeNode"), id: Id }),
  z.object({ op: z.literal("addEdge"), edge: FlowEdge }),
  z.object({ op: z.literal("removeEdge"), id: Id }),
  z.object({
    op: z.literal("setMeta"),
    name: z.string().min(1).max(LIMITS.name).optional(),
    description: z.string().max(LIMITS.description).optional(),
  }),
]);
export type PatchOp = z.infer<typeof PatchOp>;

export const Patch = z.object({ ops: z.array(PatchOp).min(1).max(200) });
export type Patch = z.infer<typeof Patch>;

export type ApplyResult =
  { ok: true; document: FlowDocument } | { ok: false; at: number; problems: Problem[] };

/**
 * Applies every operation in order, then validates the whole result.
 * A refusal says which operation (by index) it stumbled on; -1 means
 * the operations all went through and the document they left behind
 * is what does not hold together.
 */
export function applyPatch(doc: FlowDocument, patch: Patch): ApplyResult {
  let nodes = [...doc.nodes];
  let edges = [...doc.edges];
  let name = doc.name;
  let description = doc.description;

  for (const [at, op] of patch.ops.entries()) {
    const refuse = (message: string, nodeId?: string): ApplyResult => ({
      ok: false,
      at,
      problems: [{ code: "shape", message, nodeId }],
    });
    switch (op.op) {
      case "addNode": {
        if (nodes.some((n) => n.id === op.node.id) || edges.some((e) => e.id === op.node.id))
          return refuse(`id ${op.node.id} already exists`, op.node.id);
        nodes.push(op.node);
        break;
      }
      case "updateNode": {
        const i = nodes.findIndex((n) => n.id === op.id);
        if (i < 0) return refuse(`no brick ${op.id}`, op.id);
        const current = nodes[i]!;
        // The type stays; the config is replaced whole and re-read by the
        // type's own schema, so a patch cannot leave a brick half-shaped.
        const next = FlowNode.safeParse({
          ...current,
          title: op.title ?? current.title,
          config: op.config ?? current.config,
        });
        if (!next.success)
          return refuse(`${op.id}: ${next.error.issues[0]?.message ?? "invalid"}`, op.id);
        nodes[i] = next.data;
        break;
      }
      case "removeNode": {
        if (!nodes.some((n) => n.id === op.id)) return refuse(`no brick ${op.id}`, op.id);
        nodes = nodes.filter((n) => n.id !== op.id);
        edges = edges.filter((e) => e.from.node !== op.id && e.to.node !== op.id);
        break;
      }
      case "addEdge": {
        if (edges.some((e) => e.id === op.edge.id) || nodes.some((n) => n.id === op.edge.id))
          return refuse(`id ${op.edge.id} already exists`);
        if (edges.some((e) => e.to.node === op.edge.to.node && e.to.port === op.edge.to.port))
          return refuse(
            `${op.edge.to.node}.${op.edge.to.port} is already connected`,
            op.edge.to.node,
          );
        edges.push(op.edge);
        break;
      }
      case "removeEdge": {
        if (!edges.some((e) => e.id === op.id)) return refuse(`no connection ${op.id}`);
        edges = edges.filter((e) => e.id !== op.id);
        break;
      }
      case "setMeta": {
        if (op.name !== undefined) name = op.name;
        if (op.description !== undefined) description = op.description;
        break;
      }
    }
  }

  const shaped = FlowDocument.safeParse({ ...doc, name, description, nodes, edges });
  if (!shaped.success)
    return {
      ok: false,
      at: -1,
      problems: [{ code: "shape", message: shaped.error.issues[0]?.message ?? "invalid" }],
    };
  const problems = validateDocument(shaped.data);
  return problems.length ? { ok: false, at: -1, problems } : { ok: true, document: shaped.data };
}

/** The ids a patch touches, for the canvas to colour: added, changed, removed. */
export function patchTouches(patch: Patch): {
  added: Set<string>;
  changed: Set<string>;
  removed: Set<string>;
} {
  const added = new Set<string>();
  const changed = new Set<string>();
  const removed = new Set<string>();
  for (const op of patch.ops) {
    if (op.op === "addNode") added.add(op.node.id);
    else if (op.op === "addEdge") added.add(op.edge.id);
    else if (op.op === "updateNode") changed.add(op.id);
    else if (op.op === "removeNode" || op.op === "removeEdge") removed.add(op.id);
  }
  return { added, changed, removed };
}
