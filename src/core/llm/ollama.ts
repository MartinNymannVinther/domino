import {
  LlmError,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmHealth,
  type LlmMessage,
  type LlmProvider,
} from "./types";

type FetchLike = typeof fetch;

type ChatResponse = {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * Local/self-hosted provider speaking the Ollama API. Data never leaves
 * the machine (or the VPS) it runs on — the digital-sovereignty option.
 */
export class OllamaProvider implements LlmProvider {
  readonly id = "ollama";
  readonly label = "Ollama (lokal)";

  constructor(
    private readonly baseUrl: string,
    readonly model: string = "llama3.2",
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private body(messages: LlmMessage[], options: LlmCompletionOptions, think: boolean) {
    return JSON.stringify({
      model: this.model,
      messages,
      stream: false,
      // Keep the model loaded between calls: a local model that has to be
      // read from disk for every request is a model nobody waits for.
      keep_alive: "30m",
      ...(options.responseFormat === "json" ? { format: "json" } : {}),
      // Thinking models (gemma4 and friends) spend their time on hidden
      // reasoning before a structured answer; for JSON we turn that off.
      // A model without the feature rejects the flag, and we retry without.
      ...(think ? {} : { think: false }),
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.maxTokens ?? 1024,
      },
    });
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    // Local models can be slow to first load; be patient.
    const signal = AbortSignal.timeout(options.timeoutMs ?? 120_000);
    const post = (think: boolean) =>
      this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(messages, options, think),
        signal,
      });
    let response: Response;
    try {
      response = await post(options.responseFormat !== "json");
      if (response.status === 400 && options.responseFormat === "json") {
        const text = await response.text();
        if (/think/i.test(text)) response = await post(true);
        else throw new LlmError("bad_response", "ollama: HTTP 400");
      }
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError("unreachable", "ollama: endpoint did not answer");
    }

    if (!response.ok) {
      throw new LlmError("bad_response", `ollama: HTTP ${response.status}`);
    }
    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      throw new LlmError("bad_response", "ollama: malformed response body");
    }
    const content = payload.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("bad_response", "ollama: response carried no content");
    }
    return {
      content,
      model: payload.model ?? this.model,
      usage:
        payload.prompt_eval_count != null
          ? {
              inputTokens: payload.prompt_eval_count ?? 0,
              outputTokens: payload.eval_count ?? 0,
            }
          : null,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return {
        ok: false,
        reason: "unreachable",
        detail: `no Ollama endpoint at ${this.baseUrl}`,
      };
    }
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
    }
    try {
      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      const names = (payload.models ?? []).map((m) => m.name ?? "");
      const present = names.some(
        (name) => name === this.model || name.startsWith(`${this.model}:`),
      );
      if (!present) {
        // Name what is actually there. "Model not found" sends a person
        // to the documentation; a list of what they have pulled sends
        // them to the one line in .env that needs changing.
        const available = names.filter(Boolean).slice(0, 8).join(", ");
        return {
          ok: false,
          reason: "config",
          detail: available
            ? `model ${this.model} is not pulled. Ollama has: ${available}. Set LLM_MODEL to one of those, or run: ollama pull ${this.model}`
            : `model ${this.model} is not pulled, and Ollama has no models at all. Run: ollama pull ${this.model}`,
        };
      }
    } catch {
      return { ok: false, reason: "unreachable", detail: "malformed response from Ollama" };
    }
    return { ok: true, detail: `reachable, model ${this.model}` };
  }
}
