/**
 * What validation says when a document does not hold together: a code
 * the interface can say in the reader's language and, where it can, the
 * brick or connection it is about, so the canvas points at the brick
 * rather than at the document.
 */
export type Problem = {
  code: ProblemCode;
  /** An error refuses the document; a warning is stored, shown, and refuses only a run (docs/adr/0012). */
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
  port?: string;
};

export type ProblemCode =
  | "shape"
  | "duplicateId"
  | "unknownNode"
  | "unknownPort"
  | "portTaken"
  | "referenceMismatch"
  | "kindMismatch"
  | "unconnected"
  | "unusedInput"
  | "combineTooFew"
  | "cycle"
  | "loopUnpaired"
  | "loopOpen"
  | "loopEscapes"
  | "loopNested"
  | "loopHoldsEnd"
  | "noOutput"
  | "fieldOnText"
  | "unknownField";

/** The codes that mean "not finished" rather than "not a flow". */
export const WARNING_CODES: ReadonlySet<ProblemCode> = new Set([
  "unconnected",
  "unusedInput",
  "combineTooFew",
  "noOutput",
  "loopOpen",
]);

export const severityOf = (code: ProblemCode): Problem["severity"] =>
  WARNING_CODES.has(code) ? "warning" : "error";

export const errorsOf = (problems: Problem[]) => problems.filter((p) => p.severity === "error");
export const warningsOf = (problems: Problem[]) => problems.filter((p) => p.severity === "warning");
