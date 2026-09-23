/**
 * The engine: runs a flow document against a model adapter and reports
 * every step (CLAUDE.md, architecture). Pure; the runner in
 * src/modules/runs gives it a database, a provider and the files.
 */
export { providerAdapter } from "./adapter";
export { runBrick, SKIP, type BrickContext, type Outputs } from "./bricks";
export { runFlow } from "./run";
export {
  DEFAULT_ENGINE_LIMITS,
  StepFailure,
  type EngineHooks,
  type EngineLimits,
  type EngineOptions,
  type FileReader,
  type JsonObject,
  type ModelAdapter,
  type ModelReply,
  type ModelRequest,
  type PriorSteps,
  type RunResult,
  type RunTotals,
  type StepEvent,
  type StepStatus,
  type Value,
} from "./types";
export { isFileRef, isObject, toText } from "./values";
