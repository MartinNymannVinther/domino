import { applyPatch, patchTouches, type FlowDocument, type Patch } from "@/modules/flow";
import type { Mark } from "@/components/canvas/graph";

/**
 * A proposal as the canvas shows it before anybody says yes (docs/adr/
 * 0011): the document with the patch applied, added bricks and
 * connections in one colour, changed ones in another, and the bricks
 * the patch removes still drawn, faded, without their connections.
 */
export function previewProposal(
  doc: FlowDocument,
  patch: Patch,
): { document: FlowDocument; marks: Map<string, Mark> } | null {
  const applied = applyPatch(doc, patch);
  if (!applied.ok) return null;
  const { added, changed, removed } = patchTouches(patch);
  const marks = new Map<string, Mark>();
  for (const id of added) marks.set(id, "added");
  for (const id of changed) marks.set(id, "changed");
  const ghosts = doc.nodes.filter((n) => removed.has(n.id));
  for (const ghost of ghosts) marks.set(ghost.id, "removed");
  return {
    document: { ...applied.document, nodes: [...applied.document.nodes, ...ghosts] },
    marks,
  };
}
