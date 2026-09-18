import { kindsFit, referencePorts, type Kind, type PortKind } from "./kinds";
import { schemaColumns, type StructuredSchema } from "./json-schema";
import { LIMITS, type FlowDocument, type FlowEdge, type FlowNode } from "./schema";

/**
 * Every node's ports, derived from its type and config, and the kind
 * each carries (docs/flow-format.md). Some kinds depend on the graph —
 * a branch answers in the kind it was asked in, a loop's item is what
 * the list was a list of — so this is built over a whole document and
 * follows edges upstream, with memory, to answer.
 */

export type Port = { name: string; kind: Kind | null; required: boolean };

const ANY: Kind | null = null;
const text: Kind = { kind: "text" };
const json: Kind = { kind: "json" };

/** The letters combine's inputs go by. */
export const COMBINE_PORTS = Array.from({ length: LIMITS.combineInputs }, (_, i) =>
  String.fromCharCode(97 + i),
);

export function inputPorts(node: FlowNode): Port[] {
  switch (node.type) {
    case "input":
      return [];
    case "llm":
    case "structured":
      return referencePorts(node.config.prompt).map((name) => ({
        name,
        kind: ANY,
        required: true,
      }));
    case "template":
      return referencePorts(node.config.template).map((name) => ({
        name,
        kind: ANY,
        required: true,
      }));
    case "document":
      return [{ name: "file", kind: { kind: "file" }, required: true }];
    case "branch":
      return [{ name: "value", kind: ANY, required: true }];
    case "loop_start":
      return [{ name: "items", kind: { kind: "list" }, required: true }];
    case "loop_end":
      return [{ name: "item", kind: ANY, required: true }];
    case "combine":
      // At least two must be connected; which ones is validate's business.
      return COMBINE_PORTS.map((name) => ({ name, kind: ANY, required: false }));
    case "output":
      return [
        {
          name: "value",
          kind:
            node.config.kind === "table"
              ? { kind: "list", of: "json" }
              : { kind: node.config.kind },
          required: true,
        },
      ];
  }
}

export function outputPortNames(node: FlowNode): string[] {
  switch (node.type) {
    case "input":
      return ["value"];
    case "llm":
    case "document":
    case "template":
      return ["text"];
    case "structured":
      return ["json"];
    case "branch":
      return ["yes", "no"];
    case "loop_start":
      return ["item"];
    case "loop_end":
      return ["items"];
    case "combine":
      return [
        node.config.mode === "concat" ? "text" : node.config.mode === "merge" ? "json" : "list",
      ];
    case "output":
      return [];
  }
}

export class PortIndex {
  private readonly nodes = new Map<string, FlowNode>();
  private readonly into = new Map<string, FlowEdge>();
  private readonly memo = new Map<string, Kind | null>();
  private readonly visiting = new Set<string>();

  constructor(doc: FlowDocument) {
    for (const node of doc.nodes) this.nodes.set(node.id, node);
    for (const edge of doc.edges) this.into.set(`${edge.to.node}:${edge.to.port}`, edge);
  }

  node(id: string): FlowNode | undefined {
    return this.nodes.get(id);
  }

  /** The edge feeding an input port, if any. */
  edgeInto(nodeId: string, port: string): FlowEdge | undefined {
    return this.into.get(`${nodeId}:${port}`);
  }

  /** The kind an output port carries, or null when the graph cannot say. */
  outputKind(nodeId: string, port: string): Kind | null {
    const key = `${nodeId}:${port}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    if (this.visiting.has(key)) return null;
    this.visiting.add(key);
    const kind = this.computeOutputKind(nodeId, port);
    this.visiting.delete(key);
    this.memo.set(key, kind);
    return kind;
  }

  /** What arrives on an input port through its edge, or null when nothing is connected. */
  incomingKind(nodeId: string, port: string): Kind | null {
    const edge = this.edgeInto(nodeId, port);
    return edge ? this.outputKind(edge.from.node, edge.from.port) : null;
  }

  private computeOutputKind(nodeId: string, port: string): Kind | null {
    const node = this.nodes.get(nodeId);
    if (!node || !outputPortNames(node).includes(port)) return null;
    switch (node.type) {
      case "input":
        return node.config.kind === "list"
          ? { kind: "list", of: node.config.itemKind }
          : { kind: node.config.kind };
      case "llm":
      case "document":
      case "template":
        return text;
      case "structured":
        return json;
      case "branch":
        return this.incomingKind(nodeId, "value");
      case "loop_start": {
        const items = this.incomingKind(nodeId, "items");
        return items?.kind === "list" && items.of ? { kind: items.of } : null;
      }
      case "loop_end": {
        const item = this.incomingKind(nodeId, "item");
        return item ? { kind: "list", of: item.kind } : { kind: "list" };
      }
      case "combine": {
        if (node.config.mode === "concat") return text;
        if (node.config.mode === "merge") return json;
        const first = COMBINE_PORTS.map((p) => this.incomingKind(nodeId, p)).find(Boolean);
        return { kind: "list", of: first?.kind };
      }
      case "output":
        return null;
    }
  }

  /** The columns a table output would show: the schema behind its list, if the graph can name one. */
  tableColumns(outputId: string): string[] | null {
    const edge = this.edgeInto(outputId, "value");
    if (!edge) return null;
    const schema = this.jsonSchemaOf(edge.from.node, edge.from.port);
    return schema ? schemaColumns(schema) : null;
  }

  /** Follows list-carrying edges back to the structured brick that shaped the items. */
  private jsonSchemaOf(nodeId: string, port: string, depth = 0): StructuredSchema | null {
    const node = this.nodes.get(nodeId);
    if (!node || depth > LIMITS.nodes) return null;
    if (node.type === "structured") return node.config.schema;
    if (node.type === "loop_end") {
      const edge = this.edgeInto(nodeId, "item");
      return edge ? this.jsonSchemaOf(edge.from.node, edge.from.port, depth + 1) : null;
    }
    if (node.type === "branch" || node.type === "loop_start") {
      const edge = this.edgeInto(nodeId, node.type === "branch" ? "value" : "items");
      return edge ? this.jsonSchemaOf(edge.from.node, edge.from.port, depth + 1) : null;
    }
    return null;
  }
}

/** Does what `from` carries fit what `to` expects? Unknown on either side fits. */
export function portsFit(from: Kind | null, to: Kind | null): boolean {
  return !from || !to || kindsFit(from, to);
}

export type { PortKind };
