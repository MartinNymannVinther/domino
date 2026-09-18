import {
  applyPatch,
  freshId,
  inputPorts,
  outputPortNames,
  type FlowDocument,
  type FlowNode,
  type NodeType,
  type PatchOp,
} from "@/modules/flow";

/**
 * A brick as it is when it is added: a sensible config, a fresh id,
 * and — when a brick is selected — connected to it wherever the kinds
 * allow, so the ordinary "add the next step" gesture leaves nothing
 * to wire. A loop is added as its pair.
 */
export function defaultConfig(type: NodeType, title: string, loopId = "l1"): FlowNode["config"] {
  switch (type) {
    case "input":
      return { kind: "text", itemKind: "text", label: title, hint: "" };
    case "llm":
      return { prompt: "", temperature: 0.2, maxTokens: 1000 };
    case "structured":
      return {
        prompt: "",
        schema: { type: "object", properties: { svar: { type: "string" } }, required: ["svar"] },
        temperature: 0,
        maxTokens: 1000,
      };
    case "document":
      return { maxChars: 60_000 };
    case "branch":
      return { condition: { op: "notEmpty", value: "", field: "" } };
    case "loop_start":
    case "loop_end":
      return { loopId };
    case "combine":
      return { mode: "concat", separator: "\n\n" };
    case "template":
      return { template: "" };
    case "output":
      return { kind: "text", label: title };
  }
}

/** Loop ids are their own namespace: the next `l<n>` no loop pair uses. */
function freshLoopId(doc: FlowDocument): string {
  const used = new Set(
    doc.nodes.flatMap((n) =>
      n.type === "loop_start" || n.type === "loop_end" ? [n.config.loopId] : [],
    ),
  );
  let n = 1;
  while (used.has(`l${n}`)) n += 1;
  return `l${n}`;
}

export function newBrickOps(
  doc: FlowDocument,
  type: NodeType,
  titles: { title: string; endTitle: string },
  after: string | null,
): PatchOp[] {
  const taken = new Set<string>();
  const id = freshId(doc, "n", taken);
  const loopId = freshLoopId(doc);
  const node = {
    id,
    type,
    title: titles.title,
    config: defaultConfig(type, titles.title, loopId),
  } as FlowNode;
  const ops: PatchOp[] = [{ op: "addNode", node }];
  let working = { ...doc, nodes: [...doc.nodes, node] };

  if (type === "loop_start") {
    const endId = freshId(working, "n", taken);
    const end = {
      id: endId,
      type: "loop_end",
      title: titles.endTitle,
      config: { loopId },
    } as FlowNode;
    ops.push({ op: "addNode", node: end });
    working = { ...working, nodes: [...working.nodes, end] };
  }

  const source = after ? doc.nodes.find((n) => n.id === after) : null;
  if (!source) return ops;
  const outputs = outputPortNames(source);
  if (outputs.length === 0) return ops;
  const from = { node: source.id, port: outputs[0]! };

  // A prompt brick takes the source as a reference; the edge follows.
  if (type === "llm" || type === "structured" || type === "template") {
    const reference = `{{${from.node}.${from.port}}}`;
    const config =
      type === "template"
        ? { template: reference }
        : { ...(node.config as { prompt: string }), prompt: reference };
    ops[0] = { op: "addNode", node: { ...node, config } as FlowNode };
    ops.push({
      op: "addEdge",
      edge: {
        id: freshId(working, "e", taken),
        from,
        to: { node: id, port: `${from.node}.${from.port}` },
      },
    });
    return ops;
  }

  const port = inputPorts(node).find((p) => p.required || type === "combine");
  if (!port) return ops;
  const edge = {
    op: "addEdge" as const,
    edge: { id: freshId(working, "e", taken), from, to: { node: id, port: port.name } },
  };
  // Only if the kinds fit; otherwise the brick lands loose and the panel says so.
  if (applyPatch(doc, { ops: [...ops, edge] }).ok) ops.push(edge);
  return ops;
}
