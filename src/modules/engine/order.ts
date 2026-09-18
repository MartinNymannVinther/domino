import type { FlowDocument, FlowNode } from "@/modules/flow";

/**
 * The order bricks run in: every brick after everything that feeds it,
 * and otherwise in the order the document lists them, so two runs of
 * one flow tell the same story. Validation already refused circles;
 * a node left over here would be one, and is a bug upstream.
 */
export function topologicalOrder(doc: FlowDocument): FlowNode[] {
  const incoming = new Map<string, number>(doc.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(doc.nodes.map((n) => [n.id, []]));
  for (const edge of doc.edges) {
    incoming.set(edge.to.node, (incoming.get(edge.to.node) ?? 0) + 1);
    next.get(edge.from.node)?.push(edge.to.node);
  }
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const position = new Map(doc.nodes.map((n, i) => [n.id, i]));
  const ready = doc.nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const order: FlowNode[] = [];
  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!);
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const to of next.get(id) ?? []) {
      const left = (incoming.get(to) ?? 1) - 1;
      incoming.set(to, left);
      if (left === 0) ready.push(to);
    }
  }
  if (order.length !== doc.nodes.length) throw new Error("the flow runs in a circle");
  return order;
}
