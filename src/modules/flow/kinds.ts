import { z } from "zod";

/**
 * The small vocabulary every part of the flow format shares: what an id
 * looks like, what a port can carry, and how a prompt names what it
 * wants (docs/flow-format.md). Kept apart from the schema so the engine
 * and the canvas can name a kind without pulling zod's document in.
 */

/** Stable, patch-addressable, model-writable: `n3`, `e12`, `loop_a`. */
export const ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
export const Id = z.string().regex(ID_PATTERN, "id");

export const PORT_KINDS = ["text", "json", "list", "file", "boolean"] as const;
export type PortKind = (typeof PORT_KINDS)[number];

/**
 * What a port carries. A `list` says what it is a list of when the
 * schema can tell; `of` left out means "a list of something", which
 * fits anything.
 */
export type Kind = { kind: PortKind; of?: PortKind };

export const NODE_TYPES = [
  "input",
  "llm",
  "structured",
  "document",
  "branch",
  "loop_start",
  "loop_end",
  "combine",
  "template",
  "output",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** Do two kinds fit across an edge? Lists fit when their element kinds do, or one is unknown. */
export function kindsFit(from: Kind, to: Kind): boolean {
  if (from.kind !== to.kind) return false;
  if (from.kind !== "list") return true;
  return !from.of || !to.of || from.of === to.of;
}

export function kindLabel(kind: Kind): string {
  return kind.kind === "list" && kind.of ? `list<${kind.of}>` : kind.kind;
}

/**
 * A reference inside a prompt or template: `{{n2.text}}` names a port,
 * `{{n3.json.name}}` a field on a json port. The input port such a
 * reference declares is always `node.port`; the rest is a path read at
 * run time.
 */
export type Reference = { raw: string; node: string; port: string; path: string[] };

const REFERENCE = /\{\{\s*([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)((?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

export function referencesIn(text: string): Reference[] {
  const seen = new Map<string, Reference>();
  for (const match of text.matchAll(REFERENCE)) {
    const node = match[1]!;
    const port = match[2]!;
    const path = match[3] ? match[3].slice(1).split(".") : [];
    const raw = match[0];
    if (!seen.has(raw)) seen.set(raw, { raw, node, port, path });
  }
  return [...seen.values()];
}

/** The input port a reference declares on the brick that holds it. */
export const referencePort = (ref: Pick<Reference, "node" | "port">) => `${ref.node}.${ref.port}`;

/** The distinct input ports a prompt or template declares, in first-seen order. */
export function referencePorts(text: string): string[] {
  return [...new Set(referencesIn(text).map(referencePort))];
}
