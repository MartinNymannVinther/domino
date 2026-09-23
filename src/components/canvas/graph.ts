import type { Edge, Node } from "@xyflow/react";
import {
  inputPorts,
  outputPortNames,
  PortIndex,
  type FlowDocument,
  type FlowNode,
  type Kind,
  type Problem,
} from "@/modules/flow";
import { brickHeight, BRICK_WIDTH, layoutDocument } from "./layout";

/**
 * The document as React Flow sees it: one node per brick with its ports
 * and problems, one edge per connection, positions from the layout.
 * Nothing about how it looks lives here; brick-node.tsx draws it.
 */

/** How a brick is coloured when a proposal is being shown (docs/adr/0011). */
export type Mark = "added" | "changed" | "removed";

export type BrickData = {
  brick: FlowNode;
  inputs: Array<{ name: string; kind: Kind | null; required: boolean; connected: boolean }>;
  outputs: Array<{ name: string; kind: Kind | null }>;
  problems: Problem[];
  mark?: Mark;
  [key: string]: unknown;
};

export type BrickNode = Node<BrickData, "brick">;
export type BrickEdge = Edge<{ mark?: Mark }, "default">;

/** The target handle on a prompt brick that takes a new reference (flow-canvas.tsx). */
export const REFERENCE_HANDLE = "__ref";

export function hasReferenceHandle(type: FlowNode["type"]): boolean {
  return type === "llm" || type === "structured" || type === "template";
}

export function toGraph(
  doc: FlowDocument,
  problems: Problem[],
  marks: Map<string, Mark> = new Map(),
): { nodes: BrickNode[]; edges: BrickEdge[] } {
  const index = new PortIndex(doc);
  const data = new Map<string, BrickData>();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const brick of doc.nodes) {
    const inputs = inputPorts(brick)
      .filter((p) => brick.type !== "combine" || index.edgeInto(brick.id, p.name) || p.name < "c")
      .map((p) => ({ ...p, connected: Boolean(index.edgeInto(brick.id, p.name)) }));
    const outputs = outputPortNames(brick).map((name) => ({
      name,
      kind: index.outputKind(brick.id, name),
    }));
    data.set(brick.id, {
      brick,
      inputs,
      outputs,
      problems: problems.filter((p) => p.nodeId === brick.id),
      mark: marks.get(brick.id),
    });
    const rows = inputs.length + (hasReferenceHandle(brick.type) ? 1 : 0);
    // A note adds a line under the brick; the layout has to leave room.
    const noteLines = brick.note ? Math.ceil(brick.note.length / 34) + 1 : 0;
    sizes.set(brick.id, {
      width: BRICK_WIDTH,
      height: brickHeight(rows, outputs.length) + noteLines * 14,
    });
  }
  const placed = layoutDocument(doc, sizes);
  const nodes: BrickNode[] = doc.nodes.map((brick) => {
    const at = placed.get(brick.id)!;
    return {
      id: brick.id,
      type: "brick",
      position: { x: at.x, y: at.y },
      width: at.width,
      height: at.height,
      data: data.get(brick.id)!,
      // Layout is the document's, never the person's (docs/flow-format.md).
      draggable: false,
    };
  });
  const edges: BrickEdge[] = doc.edges.map((edge) => ({
    id: edge.id,
    type: "default",
    source: edge.from.node,
    sourceHandle: edge.from.port,
    target: edge.to.node,
    targetHandle: edge.to.port,
    data: { mark: marks.get(edge.id) },
    className: marks.get(edge.id) ? `edge-${marks.get(edge.id)}` : undefined,
  }));
  return { nodes, edges };
}
