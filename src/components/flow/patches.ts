import {
  applyPatch,
  freshId,
  inputPorts,
  outputPortNames,
  PortIndex,
  referenceEdgeOps,
  referenceSource,
  type FlowDocument,
  type FlowNode,
  type NodeType,
  type PatchOp,
} from "@/modules/flow";
import { REFERENCE_HANDLE } from "@/components/canvas/graph";

/**
 * How a gesture on the canvas or a field in the panel becomes a patch
 * (docs/adr/0011). Everything here is pure and runs in the browser, so
 * a connection can be judged while it is being dragged and a change
 * can be refused before it is sent. The server applies the same
 * functions again; this is convenience, the boundary is there.
 */

export type ConnectionLike = {
  source: string | null;
  sourceHandle: string | null;
  target: string | null;
  targetHandle: string | null;
};

/** The operations a drawn connection stands for, or null when it is not one. */
export function connectOps(doc: FlowDocument, c: ConnectionLike): PatchOp[] | null {
  if (!c.source || !c.sourceHandle || !c.target || !c.targetHandle) return null;
  if (c.source === c.target) return null;
  const target = doc.nodes.find((n) => n.id === c.target);
  const source = doc.nodes.find((n) => n.id === c.source);
  if (!target || !source || !outputPortNames(source).includes(c.sourceHandle)) return null;

  // Dropped on the + of a prompt brick: the reference is written into the
  // text, and the edge follows from the text.
  if (c.targetHandle === REFERENCE_HANDLE) {
    const text = referenceSource(target);
    if (text === null) return null;
    const reference = `{{${c.source}.${c.sourceHandle}}}`;
    if (text.includes(reference)) return [];
    const next = `${text.trimEnd()}\n\n${reference}`;
    const config =
      target.type === "template"
        ? { ...target.config, template: next }
        : { ...target.config, prompt: next };
    return [
      { op: "updateNode", id: target.id, config },
      ...referenceEdgeOps(
        {
          ...doc,
          nodes: doc.nodes.map((n) => (n.id === target.id ? ({ ...n, config } as FlowNode) : n)),
        },
        target.id,
        next,
      ),
    ];
  }

  const port = inputPorts(target).find((p) => p.name === c.targetHandle);
  if (!port) return null;
  const index = new PortIndex(doc);
  if (index.edgeInto(target.id, port.name)) return null;
  // A reference port names where it wants to be fed from.
  if (port.name.includes(".") && port.name !== `${c.source}.${c.sourceHandle}`) return null;
  return [
    {
      op: "addEdge",
      edge: {
        id: freshId(doc, "e"),
        from: { node: c.source, port: c.sourceHandle },
        to: { node: target.id, port: port.name },
      },
    },
  ];
}

/** Would this connection leave a document with no errors? Asked while dragging. */
export function connectionAllowed(doc: FlowDocument, c: ConnectionLike): boolean {
  const ops = connectOps(doc, c);
  if (!ops) return false;
  if (ops.length === 0) return true;
  return applyPatch(doc, { ops }).ok;
}

/** A brick's new config, with the edges its text implies. */
export function updateConfigOps(
  doc: FlowDocument,
  nodeId: string,
  config: FlowNode["config"],
  title?: string,
): PatchOp[] {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  const next = { ...node, config, ...(title !== undefined ? { title } : {}) } as FlowNode;
  const ops: PatchOp[] = [
    { op: "updateNode", id: nodeId, config, ...(title !== undefined ? { title } : {}) },
  ];
  const text = referenceSource(next);
  if (text !== null) ops.push(...referenceEdgeOps(doc, nodeId, text));
  return ops;
}

/** Everything a brick's removal takes with it is implied; the op is one. */
export function removeOps(doc: FlowDocument, ids: { nodes: string[]; edges: string[] }): PatchOp[] {
  const ops: PatchOp[] = [];
  const goneNodes = new Set(ids.nodes.filter((id) => doc.nodes.some((n) => n.id === id)));
  for (const id of goneNodes) ops.push({ op: "removeNode", id });
  for (const id of ids.edges) {
    const edge = doc.edges.find((e) => e.id === id);
    if (edge && !goneNodes.has(edge.from.node) && !goneNodes.has(edge.to.node))
      ops.push({ op: "removeEdge", id });
  }
  return ops;
}

/** A change to a reference port's edge from the panel: none, or from this source. */
export function reconnectOps(
  doc: FlowDocument,
  nodeId: string,
  port: string,
  from: { node: string; port: string } | null,
): PatchOp[] {
  const ops: PatchOp[] = [];
  const existing = doc.edges.find((e) => e.to.node === nodeId && e.to.port === port);
  if (existing) ops.push({ op: "removeEdge", id: existing.id });
  if (from) {
    ops.push({
      op: "addEdge",
      edge: { id: freshId(doc, "e"), from, to: { node: nodeId, port } },
    });
  }
  return ops;
}

/** Every output port in the document that could feed `port` on `nodeId`, for a select. */
export function candidateSources(
  doc: FlowDocument,
  nodeId: string,
  port: string,
): Array<{ node: string; port: string; title: string }> {
  const out: Array<{ node: string; port: string; title: string }> = [];
  for (const node of doc.nodes) {
    if (node.id === nodeId) continue;
    for (const name of outputPortNames(node)) {
      if (port.includes(".") && port !== `${node.id}.${name}`) continue;
      const trial = applyPatch(
        { ...doc, edges: doc.edges.filter((e) => !(e.to.node === nodeId && e.to.port === port)) },
        {
          ops: [
            {
              op: "addEdge",
              edge: {
                id: "trial_edge",
                from: { node: node.id, port: name },
                to: { node: nodeId, port },
              },
            },
          ],
        },
      );
      if (trial.ok) out.push({ node: node.id, port: name, title: node.title });
    }
  }
  return out;
}

export type { NodeType };
