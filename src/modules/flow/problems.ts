/**
 * What validation says when a document does not hold together: a code
 * the interface can say in the reader's language and, where it can, the
 * brick or connection it is about, so the canvas points at the brick
 * rather than at the document.
 */
export type Problem = {
  code: ProblemCode;
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
  | "combineTooFew"
  | "cycle"
  | "loopUnpaired"
  | "loopEscapes"
  | "loopNested"
  | "loopHoldsEnd"
  | "noOutput"
  | "fieldOnText"
  | "unknownField";
