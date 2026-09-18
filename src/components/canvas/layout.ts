import dagre from "@dagrejs/dagre";
import type { FlowDocument } from "@/modules/flow";

/**
 * Where every brick goes, computed from the graph every time it is
 * drawn (docs/flow-format.md): left to right, rank by dependency, so
 * nobody arranges anything and two people see the same picture. The
 * sizes here are the brick component's; the height grows with the
 * number of ports so the edges land on their rows.
 */

export const BRICK_WIDTH = 240;
const BRICK_BASE_HEIGHT = 64;
const PORT_ROW = 22;

export type Placed = { id: string; x: number; y: number; width: number; height: number };

export function brickHeight(inputs: number, outputs: number): number {
  return BRICK_BASE_HEIGHT + Math.max(inputs, outputs, 1) * PORT_ROW;
}

export function layoutDocument(
  doc: FlowDocument,
  sizes: Map<string, { width: number; height: number }>,
): Map<string, Placed> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 56, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of doc.nodes) {
    const size = sizes.get(node.id) ?? { width: BRICK_WIDTH, height: brickHeight(1, 1) };
    graph.setNode(node.id, size);
  }
  for (const edge of doc.edges) graph.setEdge(edge.from.node, edge.to.node);
  dagre.layout(graph);
  const placed = new Map<string, Placed>();
  for (const node of doc.nodes) {
    const { x, y, width, height } = graph.node(node.id);
    // dagre gives centres; React Flow wants the top-left corner.
    placed.set(node.id, { id: node.id, x: x - width / 2, y: y - height / 2, width, height });
  }
  return placed;
}
