/**
 * The flow document and everything that changes it (docs/adr/0011). One
 * import for the canvas, the engine, the conversation and the service.
 */
export { diffDocuments } from "./diff";
export { EXAMPLE_FLOWS, exampleFlow } from "./examples";
export {
  exportDocument,
  importDocument,
  importRaw,
  MAX_IMPORT_BYTES,
  type ImportResult,
} from "./io";
export { schemaColumns, schemaProblems, StructuredSchema } from "./json-schema";
export {
  ID_PATTERN,
  kindLabel,
  NODE_TYPES,
  PORT_KINDS,
  referencePort,
  referencePorts,
  referencesIn,
  type Kind,
  type NodeType,
  type PortKind,
  type Reference,
} from "./kinds";
export { loopBody } from "./loops";
export { migrateDocument } from "./migrate";
export { applyPatch, Patch, PatchOp, patchTouches, type ApplyResult } from "./patch";
export { COMBINE_PORTS, inputPorts, outputPortNames, PortIndex, type Port } from "./ports";
export { errorsOf, severityOf, warningsOf, type Problem, type ProblemCode } from "./problems";
export { freshId, missingReferenceEdgeOps, referenceEdgeOps, referenceSource } from "./references";
export { FileRef, itemCount, RUN_LIMITS, validateRunInput, type RunInput } from "./run-input";
export {
  BRANCH_OPS,
  COMBINE_MODES,
  FlowDocument,
  FlowEdge,
  FlowNode,
  FORMAT,
  FORMAT_VERSION,
  INPUT_KINDS,
  LIMITS,
  OUTPUT_KINDS,
  type FlowNodeOf,
  type NodeConfig,
  type PortRef,
} from "./schema";
export { parseDocument, validateDocument, type ParseResult } from "./validate";
