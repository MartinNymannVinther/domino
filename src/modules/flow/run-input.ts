import { z } from "zod";
import type { FlowDocument } from "./schema";

/**
 * What a run is given, checked against the flow's input bricks
 * (CLAUDE.md, security rules). A text brick takes a string, a file brick
 * a reference to a row in `files`, a list brick a list of one or the
 * other; anything else, anything missing and anything extra is refused
 * before a row is written. The ceilings are the run's own (docs/adr/0012).
 */

export const RUN_LIMITS = {
  textChars: 200_000,
  itemsPerRun: 500,
} as const;

export const FileRef = z.object({
  fileId: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  mime: z.string().min(1).max(120),
});
export type FileRef = z.infer<typeof FileRef>;

const Text = z.string().max(RUN_LIMITS.textChars);

export type RunInput = Record<string, string | FileRef | Array<string | FileRef>>;

export type RunInputResult =
  | { ok: true; input: RunInput }
  | { ok: false; problems: Array<{ nodeId: string; message: string }> };

export function validateRunInput(doc: FlowDocument, raw: unknown): RunInputResult {
  const given =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const problems: Array<{ nodeId: string; message: string }> = [];
  const input: RunInput = {};
  const known = new Set<string>();

  for (const node of doc.nodes) {
    if (node.type !== "input") continue;
    known.add(node.id);
    const value = given[node.id];
    const schema =
      node.config.kind === "text"
        ? Text
        : node.config.kind === "file"
          ? FileRef
          : z.array(node.config.itemKind === "file" ? FileRef : Text).max(RUN_LIMITS.itemsPerRun);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      problems.push({ nodeId: node.id, message: value === undefined ? "missing" : "invalid" });
      continue;
    }
    input[node.id] = parsed.data;
  }
  for (const key of Object.keys(given)) {
    if (!known.has(key)) problems.push({ nodeId: key, message: "unknown" });
  }
  return problems.length ? { ok: false, problems } : { ok: true, input };
}

/** How many times the loops will go round, for the ceiling on a run before it starts. */
export function itemCount(input: RunInput): number {
  return Object.values(input).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
}
