/**
 * LLM adapter boundary (CLAUDE.md): all model access goes through this
 * interface, providers prefer EU-hosted (Mistral) or local/self-hosted
 * (Ollama-compatible) endpoints, and nothing an AI drafts leaves the
 * house without explicit human approval — enforced by the features that
 * use this, not here.
 *
 * Deliberately minimal for the first slice: chat completion with an
 * optional JSON mode (signal scoring will want structured output) and a
 * health check that validates configuration without burning tokens.
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCompletionOptions = {
  /** Upper bound on generated tokens; providers apply their own default. */
  maxTokens?: number;
  /** 0..1; defaults to a low, deterministic-ish value. */
  temperature?: number;
  /** Ask the model to emit a single JSON object. */
  responseFormat?: "text" | "json";
  timeoutMs?: number;
};

export type LlmCompletion = {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
};

export type LlmHealth =
  | { ok: true; detail: string }
  | { ok: false; reason: "auth" | "unreachable" | "config"; detail: string };

export interface LlmProvider {
  /** Stable identifier, e.g. "mistral" or "ollama". */
  readonly id: string;
  /** Human-readable name for the settings UI. */
  readonly label: string;
  /** The model completions will use. */
  readonly model: string;
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<LlmCompletion>;
  /** Cheap configuration probe: auth/reachability, no token spend. */
  healthCheck(): Promise<LlmHealth>;
}

/** Thrown by providers on failed completions; carries no secrets. */
export class LlmError extends Error {
  constructor(
    readonly reason: "auth" | "rate_limit" | "unreachable" | "bad_response",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
