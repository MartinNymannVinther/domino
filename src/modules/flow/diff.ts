import type { Patch, PatchOp } from "./patch";
import type { FlowDocument } from "./schema";

/**
 * The patch that turns one document into another, for the two places
 * a change arrives as a whole document rather than as operations: an
 * undo (the older version's document, wanted back) and a comparison
 * between any two versions in the history. The result is in the same
 * vocabulary as a hand-written patch, so the canvas draws it the same
 * way, and `applyPatch(a, diff(a, b))` gives `b` — with the nodes in
 * `b`'s order where they were added, and `a`'s where they stayed.
 */
export function diffDocuments(a: FlowDocument, b: FlowDocument): Patch | null {
  const ops: PatchOp[] = [];
  const aNodes = new Map(a.nodes.map((n) => [n.id, n]));
  const bNodes = new Map(b.nodes.map((n) => [n.id, n]));
  const aEdges = new Map(a.edges.map((e) => [e.id, e]));
  const bEdges = new Map(b.edges.map((e) => [e.id, e]));

  // Edges first out, nodes last in: a removed node takes its edges with
  // it, and an added edge needs both its ends to exist.
  for (const [id, edge] of aEdges) {
    const other = bEdges.get(id);
    if (!other || !same(edge, other)) ops.push({ op: "removeEdge", id });
  }
  const replaced = new Set<string>();
  for (const [id, node] of aNodes) {
    const other = bNodes.get(id);
    if (!other || other.type !== node.type) {
      ops.push({ op: "removeNode", id });
      replaced.add(id);
    } else if (other.title !== node.title || !same(other.config, node.config))
      ops.push({ op: "updateNode", id, title: other.title, config: other.config });
  }
  for (const [id, node] of bNodes) {
    const mine = aNodes.get(id);
    if (!mine || mine.type !== node.type) ops.push({ op: "addNode", node });
  }
  for (const [id, edge] of bEdges) {
    const mine = aEdges.get(id);
    // A removed node took its edges with it, even the ones that stay.
    const orphaned = replaced.has(edge.from.node) || replaced.has(edge.to.node);
    if (!mine || !same(edge, mine) || orphaned) ops.push({ op: "addEdge", edge });
  }
  if (a.name !== b.name || a.description !== b.description)
    ops.push({ op: "setMeta", name: b.name, description: b.description });
  return ops.length ? { ops } : null;
}

function same(x: unknown, y: unknown): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}
