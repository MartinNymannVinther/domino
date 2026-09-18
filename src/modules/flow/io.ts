import { migrateDocument } from "./migrate";
import type { Problem } from "./problems";
import { referencePorts } from "./kinds";
import { applyPatch } from "./patch";
import { missingReferenceEdgeOps, referenceSource } from "./references";
import { FlowDocument } from "./schema";
import { parseDocument } from "./validate";

/**
 * A flow as one file, in and out (dogma three). Export writes the current
 * document as it is; import reads a file, migrates it forward, adds the
 * edges its prompts imply when a hand-written file left them out, and
 * validates the whole before anything is stored.
 */

export type ImportResult =
  | { ok: true; document: FlowDocument; migratedFrom: number | null }
  | {
      ok: false;
      reason: "notJson" | "notAFlow" | "tooNew" | "unknownVersion" | "invalid";
      problems?: Problem[];
      version?: number;
    };

export const MAX_IMPORT_BYTES = 2_000_000;

export function exportDocument(doc: FlowDocument): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

export function importDocument(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: "invalid" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  return importRaw(raw);
}

export function importRaw(raw: unknown): ImportResult {
  const migrated = migrateDocument(raw);
  if (!migrated.ok) return { ok: false, reason: migrated.reason, version: migrated.version };
  const migratedFrom = migrated.from < FlowDocument.shape.version.value ? migrated.from : null;
  // A file written by hand, or by a model, may carry prompts without the
  // edges they imply; those are written in before the whole is judged.
  let candidate: unknown = migrated.document;
  const shaped = FlowDocument.safeParse(candidate);
  if (shaped.success && needsReferenceEdges(shaped.data)) {
    const ops = missingReferenceEdgeOps(shaped.data);
    const applied = ops.length ? applyPatch(shaped.data, { ops }) : null;
    if (applied?.ok) candidate = applied.document;
  }
  const parsed = parseDocument(candidate);
  if (parsed.ok) return { ok: true, document: parsed.document, migratedFrom };
  return { ok: false, reason: "invalid", problems: parsed.problems };
}

function needsReferenceEdges(doc: FlowDocument): boolean {
  return doc.nodes.some((node) => {
    const text = referenceSource(node);
    return (
      text !== null &&
      referencePorts(text).some(
        (port) => !doc.edges.some((e) => e.to.node === node.id && e.to.port === port),
      )
    );
  });
}
