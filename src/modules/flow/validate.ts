import { z } from "zod";
import { checkLoops, hasCycle } from "./loops";
import { referencesIn } from "./kinds";
import { inputPorts, outputPortNames, PortIndex, portsFit } from "./ports";
import type { Problem } from "./problems";
import { FlowDocument } from "./schema";

/**
 * Whether a document holds together (docs/flow-format.md): every id
 * unique, every edge between ports that exist and fit, every required
 * input connected, no cycles, every loop a proper pair. The shape is
 * zod's business (schema.ts); this is the rest, and both run before a
 * document is stored, drawn or run.
 *
 * A problem carries a code the interface can say in the reader's
 * language and, where it can, the node or edge it is about, so the
 * canvas can point at the brick rather than at the document.
 */

export type { Problem, ProblemCode } from "./problems";

export type ParseResult = { ok: true; document: FlowDocument } | { ok: false; problems: Problem[] };

/** Shape first, then the rules; a document that fails the shape gets no further. */
export function parseDocument(raw: unknown): ParseResult {
  const parsed = FlowDocument.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: shapeProblems(parsed.error) };
  const problems = validateDocument(parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, document: parsed.data };
}

function shapeProblems(error: z.ZodError): Problem[] {
  return error.issues.slice(0, 20).map((issue) => ({
    code: "shape",
    message: `${issue.path.join(".") || "document"}: ${issue.message}`,
  }));
}

export function validateDocument(doc: FlowDocument): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const item of [...doc.nodes, ...doc.edges]) {
    if (ids.has(item.id))
      problems.push({
        code: "duplicateId",
        message: `id ${item.id} is used twice`,
        nodeId: item.id,
      });
    ids.add(item.id);
  }
  if (problems.length) return problems;

  const index = new PortIndex(doc);
  checkEdges(doc, index, problems);
  checkInputs(doc, index, problems);
  checkReferences(doc, index, problems);
  if (!doc.nodes.some((n) => n.type === "output"))
    problems.push({ code: "noOutput", message: "a flow needs at least one output brick" });
  if (hasCycle(doc)) problems.push({ code: "cycle", message: "the flow runs in a circle" });
  else checkLoops(doc, problems);
  return problems;
}

function checkEdges(doc: FlowDocument, index: PortIndex, problems: Problem[]) {
  const taken = new Set<string>();
  for (const edge of doc.edges) {
    const from = index.node(edge.from.node);
    const to = index.node(edge.to.node);
    if (!from || !to) {
      problems.push({
        code: "unknownNode",
        message: `edge ${edge.id} names a brick that does not exist`,
        edgeId: edge.id,
      });
      continue;
    }
    if (!outputPortNames(from).includes(edge.from.port)) {
      problems.push({
        code: "unknownPort",
        message: `${from.id} has no output ${edge.from.port}`,
        edgeId: edge.id,
        nodeId: from.id,
        port: edge.from.port,
      });
      continue;
    }
    const toPort = inputPorts(to).find((p) => p.name === edge.to.port);
    if (!toPort) {
      problems.push({
        code: "unknownPort",
        message: `${to.id} has no input ${edge.to.port}`,
        edgeId: edge.id,
        nodeId: to.id,
        port: edge.to.port,
      });
      continue;
    }
    const key = `${to.id}:${toPort.name}`;
    if (taken.has(key)) {
      problems.push({
        code: "portTaken",
        message: `${to.id}.${toPort.name} is connected twice`,
        edgeId: edge.id,
        nodeId: to.id,
        port: toPort.name,
      });
      continue;
    }
    taken.add(key);
    // A reference port says where it expects to be fed from; the edge must agree.
    if (toPort.name.includes(".") && toPort.name !== `${edge.from.node}.${edge.from.port}`) {
      problems.push({
        code: "referenceMismatch",
        message: `${to.id} expects ${toPort.name} but is fed from ${edge.from.node}.${edge.from.port}`,
        edgeId: edge.id,
        nodeId: to.id,
        port: toPort.name,
      });
      continue;
    }
    const fromKind = index.outputKind(from.id, edge.from.port);
    if (!portsFit(fromKind, toPort.kind)) {
      problems.push({
        code: "kindMismatch",
        message: `${from.id}.${edge.from.port} carries ${fromKind?.kind} but ${to.id}.${toPort.name} takes ${toPort.kind?.kind}`,
        edgeId: edge.id,
        nodeId: to.id,
        port: toPort.name,
      });
    }
  }
}

function checkInputs(doc: FlowDocument, index: PortIndex, problems: Problem[]) {
  for (const node of doc.nodes) {
    const ports = inputPorts(node);
    for (const port of ports) {
      if (port.required && !index.edgeInto(node.id, port.name))
        problems.push({
          code: "unconnected",
          message: `${node.id} is missing its input ${port.name}`,
          nodeId: node.id,
          port: port.name,
        });
    }
    if (node.type === "combine") {
      const connected = ports.filter((p) => index.edgeInto(node.id, p.name)).length;
      if (connected < 2)
        problems.push({
          code: "combineTooFew",
          message: `${node.id} combines fewer than two inputs`,
          nodeId: node.id,
        });
    }
  }
}

/** `{{n3.json.name}}` must point at a field a json port has; `{{n2.text.x}}` points at nothing. */
function checkReferences(doc: FlowDocument, index: PortIndex, problems: Problem[]) {
  for (const node of doc.nodes) {
    const source =
      node.type === "llm" || node.type === "structured"
        ? node.config.prompt
        : node.type === "template"
          ? node.config.template
          : null;
    if (source === null) continue;
    for (const ref of referencesIn(source)) {
      if (ref.path.length === 0) continue;
      const kind = index.outputKind(ref.node, ref.port);
      if (kind && kind.kind !== "json") {
        problems.push({
          code: "fieldOnText",
          message: `${node.id} reads a field of ${ref.node}.${ref.port}, which is not structured`,
          nodeId: node.id,
          port: `${ref.node}.${ref.port}`,
        });
        continue;
      }
      const producer = index.node(ref.node);
      if (producer?.type === "structured" && !(ref.path[0]! in producer.config.schema.properties)) {
        problems.push({
          code: "unknownField",
          message: `${ref.node} has no field ${ref.path[0]}`,
          nodeId: node.id,
          port: `${ref.node}.${ref.port}`,
        });
      }
    }
  }
}
