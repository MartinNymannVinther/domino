import { referencePorts } from "./kinds";
import type { PatchOp } from "./patch";
import type { FlowDocument, FlowNode } from "./schema";

/**
 * The connections a prompt implies. A brick that says `{{n2.text}}` has
 * declared an input, and the document only holds together when an edge
 * feeds it; so when a person types a reference into a prompt, or the
 * model proposes one, the edges are derived from the text rather than
 * asked for. The patch still carries them explicitly — the document
 * never has an edge nobody wrote — this only writes them.
 */

/** A fresh id with the given prefix that no node or edge in the document uses. */
export function freshId(doc: FlowDocument, prefix: string, taken: Set<string> = new Set()): string {
  const used = new Set([...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id), ...taken]);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  const id = `${prefix}${n}`;
  taken.add(id);
  return id;
}

/** The prompt or template a node reads references from, if it has one. */
export function referenceSource(node: FlowNode): string | null {
  if (node.type === "llm" || node.type === "structured") return node.config.prompt;
  if (node.type === "template") return node.config.template;
  return null;
}

/**
 * The edge operations that bring `nodeId`'s reference ports in line with
 * `text`: an edge added for every reference that has none, an edge
 * removed for every reference port that is no longer named. Appended to
 * the updateNode op that changes the text, in the same patch.
 */
export function referenceEdgeOps(doc: FlowDocument, nodeId: string, text: string): PatchOp[] {
  const wanted = new Set(referencePorts(text));
  const existing = doc.edges.filter((e) => e.to.node === nodeId && e.to.port.includes("."));
  const ops: PatchOp[] = [];
  for (const edge of existing) {
    if (!wanted.has(edge.to.port)) ops.push({ op: "removeEdge", id: edge.id });
  }
  const taken = new Set<string>();
  for (const port of wanted) {
    if (existing.some((e) => e.to.port === port)) continue;
    const [node, from] = port.split(".") as [string, string];
    // A reference to a brick that does not exist gets no edge; validation
    // then names the brick, which is the message the person needs.
    if (!doc.nodes.some((n) => n.id === node)) continue;
    ops.push({
      op: "addEdge",
      edge: {
        id: freshId(doc, "e", taken),
        from: { node, port: from },
        to: { node: nodeId, port },
      },
    });
  }
  return ops;
}

/**
 * Every reference edge the whole document is missing, for a document
 * that arrives written by hand or by the model with prompts but without
 * the edges they imply. Edges that exist are left alone.
 */
export function missingReferenceEdgeOps(doc: FlowDocument): PatchOp[] {
  const ops: PatchOp[] = [];
  const taken = new Set<string>();
  for (const node of doc.nodes) {
    const text = referenceSource(node);
    if (text === null) continue;
    for (const port of referencePorts(text)) {
      if (doc.edges.some((e) => e.to.node === node.id && e.to.port === port)) continue;
      const [from, fromPort] = port.split(".") as [string, string];
      if (!doc.nodes.some((n) => n.id === from)) continue;
      ops.push({
        op: "addEdge",
        edge: {
          id: freshId(doc, "e", taken),
          from: { node: from, port: fromPort },
          to: { node: node.id, port },
        },
      });
    }
  }
  return ops;
}
