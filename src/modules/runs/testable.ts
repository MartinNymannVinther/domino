import type { NodeType } from "@/modules/flow";

/**
 * Which bricks can be tried on their own. Input, output and the loop
 * pair mean nothing without the run around them; every other brick
 * takes values and gives values, and that is a thing to try. Imports
 * nothing, so the canvas can ask without pulling the runner in.
 */
const UNTESTABLE = new Set<NodeType>(["input", "loop_start", "loop_end", "output"]);

export function testableBrick(type: NodeType): boolean {
  return !UNTESTABLE.has(type);
}
