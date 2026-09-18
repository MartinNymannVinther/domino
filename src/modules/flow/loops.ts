import type { Problem } from "./problems";
import type { FlowDocument, FlowNode } from "./schema";

/**
 * The graph half of validation: no circles, and every loop a proper
 * pair. A loop is a start and an end with the same loopId; everything
 * the start reaches must come back to the end — a brick between them
 * that leads elsewhere would run once per item and hand its result to
 * something that runs once — and nothing in between may be a loop of
 * its own, an input or an output (docs/flow-format.md).
 */

function successors(doc: FlowDocument): Map<string, string[]> {
  const out = new Map<string, string[]>(doc.nodes.map((n) => [n.id, []]));
  for (const edge of doc.edges) out.get(edge.from.node)?.push(edge.to.node);
  return out;
}

export function hasCycle(doc: FlowDocument): boolean {
  const next = successors(doc);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const to of next.get(id) ?? []) if (visit(to)) return true;
    state.set(id, 2);
    return false;
  };
  return doc.nodes.some((n) => visit(n.id));
}

/** Everything downstream of `start`; a `stop` node is reached but not walked past. */
function reachableFrom(start: string, next: Map<string, string[]>, stop?: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === stop) continue;
    for (const to of next.get(id) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return seen;
}

/**
 * A loop is a pair with the same loopId. Everything the start reaches
 * must come back to the end — a brick between them that leads elsewhere
 * would be running once per item and handing its result to something
 * that runs once — and nothing in between may be a loop of its own, an
 * input or an output.
 */
export function checkLoops(doc: FlowDocument, problems: Problem[]) {
  const next = successors(doc);
  const starts = new Map<string, FlowNode[]>();
  const ends = new Map<string, FlowNode[]>();
  for (const node of doc.nodes) {
    if (node.type === "loop_start")
      (
        starts.get(node.config.loopId) ??
        starts.set(node.config.loopId, []).get(node.config.loopId)!
      ).push(node);
    if (node.type === "loop_end")
      (
        ends.get(node.config.loopId) ?? ends.set(node.config.loopId, []).get(node.config.loopId)!
      ).push(node);
  }
  for (const loopId of new Set([...starts.keys(), ...ends.keys()])) {
    const start = starts.get(loopId) ?? [];
    const end = ends.get(loopId) ?? [];
    if (start.length !== 1 || end.length !== 1) {
      problems.push({
        code: "loopUnpaired",
        message: `loop ${loopId} needs exactly one start and one end`,
        nodeId: (start[0] ?? end[0])?.id,
      });
      continue;
    }
    const reach = reachableFrom(start[0]!.id, next, end[0]!.id);
    if (!reach.has(end[0]!.id)) {
      problems.push({
        code: "loopUnpaired",
        message: `loop ${loopId} never reaches its end`,
        nodeId: start[0]!.id,
      });
      continue;
    }
    for (const id of reach) {
      if (id === end[0]!.id) continue;
      const node = doc.nodes.find((n) => n.id === id)!;
      if (node.type === "loop_start" || node.type === "loop_end")
        problems.push({
          code: "loopNested",
          message: `${id} is a loop inside loop ${loopId}; loops do not nest`,
          nodeId: id,
        });
      else if (node.type === "output")
        problems.push({
          code: "loopHoldsEnd",
          message: `${id} is an output inside loop ${loopId}`,
          nodeId: id,
        });
      else if (!reachableFrom(id, next).has(end[0]!.id))
        problems.push({
          code: "loopEscapes",
          message: `${id} runs inside loop ${loopId} but never comes back to its end`,
          nodeId: id,
        });
    }
  }
}

/** The body of a loop: what its start reaches, short of its end. Empty when the pair is broken. */
export function loopBody(
  doc: FlowDocument,
  loopId: string,
): { start: string; end: string; body: Set<string> } | null {
  const start = doc.nodes.find((n) => n.type === "loop_start" && n.config.loopId === loopId);
  const end = doc.nodes.find((n) => n.type === "loop_end" && n.config.loopId === loopId);
  if (!start || !end) return null;
  const body = reachableFrom(start.id, successors(doc), end.id);
  body.delete(end.id);
  return { start: start.id, end: end.id, body };
}
