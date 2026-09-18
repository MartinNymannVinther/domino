import type { FileRef, RunInput } from "@/modules/flow";

/**
 * What the engine speaks (CLAUDE.md, architecture): a pure function over
 * the document with a model adapter injected, telling whoever is
 * listening about every step as it happens. Nothing here knows about a
 * database, a session or a provider; the runner in src/modules/runs
 * supplies those.
 */

export type JsonObject = { [key: string]: Value };
/** What a port carries at run time (docs/flow-format.md, "Values at run time"). */
export type Value = string | number | boolean | null | JsonObject | Value[] | FileRef;

export type ModelRequest = {
  system: string;
  user: string;
  json: boolean;
  temperature: number;
  maxTokens: number;
};

export type ModelReply = {
  content: string;
  usage: { inputTokens: number; outputTokens: number } | null;
};

/** The one thing the engine needs from a model. */
export interface ModelAdapter {
  /** Named in the run's history: "mistral:mistral-small-latest", "fake". */
  readonly engine: string;
  complete(request: ModelRequest): Promise<ModelReply>;
}

/** How the document brick reads a file: the text extracted at upload, or why there is none. */
export type FileReader = (fileId: string) => Promise<{ text: string } | { error: string }>;

export type StepStatus = "running" | "done" | "failed" | "skipped";

export type StepEvent = {
  nodeId: string;
  /** Which time round inside a loop; 0 outside one. */
  iteration: number;
  status: StepStatus;
  input?: Record<string, Value>;
  output?: Record<string, Value>;
  error?: string;
  tokensIn: number;
  tokensOut: number;
};

export type EngineHooks = {
  /** Called for every status a step passes through; awaited, so the runner can write the row first. */
  onStep?: (event: StepEvent) => Promise<void> | void;
  /** Checked before every step; true stops the run as cancelled. */
  shouldStop?: () => boolean | Promise<boolean>;
};

export type EngineLimits = {
  /** Steps in one run, loops included. */
  maxSteps: number;
  /** Model calls in one run. */
  maxModelCalls: number;
};

export const DEFAULT_ENGINE_LIMITS: EngineLimits = { maxSteps: 5000, maxModelCalls: 1000 };

export type EngineOptions = {
  model: ModelAdapter | null;
  readFile: FileReader;
  input: RunInput;
  hooks?: EngineHooks;
  limits?: Partial<EngineLimits>;
};

export type RunTotals = { steps: number; modelCalls: number; tokensIn: number; tokensOut: number };

export type RunResult =
  | ({ ok: true; output: Record<string, Value | null> } & RunTotals)
  | ({
      ok: false;
      cancelled: boolean;
      error: string;
      nodeId?: string;
      iteration?: number;
    } & RunTotals);

/** Thrown by a brick; the engine turns it into the run's failure, naming the brick. */
export class StepFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepFailure";
  }
}
