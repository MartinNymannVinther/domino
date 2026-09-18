import {
  LlmError,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmHealth,
  type LlmMessage,
  type LlmProvider,
} from "./types";

type FetchLike = typeof fetch;

/**
 * The EU endpoint, and the default on purpose.
 *
 * Mistral runs three: api.mistral.ai, api.eu.mistral.ai and
 * api.us.mistral.ai. The first is the obvious-looking one and is the
 * wrong one here, because Mistral states plainly that they do not commit
 * to an inference location for it. Dogma four says EU or self-hosted,
 * language models included, and docs/subprocessors.md makes that claim in
 * writing to the people whose names are in the prompts.
 *
 * The regional endpoints cost 1.1x. That is the price of the sentence on
 * the subprocessors page being true, which makes it cheap.
 */
export const MISTRAL_EU_BASE_URL = "https://api.eu.mistral.ai/v1";

type ChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * Mistral, on whichever endpoint the installation named; EU unless it
 * said otherwise. The API key is a secret: it is read from the
 * environment, sent only as the Authorization header, and never appears
 * in errors or logs.
 */
export class MistralProvider implements LlmProvider {
  readonly id = "mistral";
  readonly label = "Mistral (EU)";

  constructor(
    private readonly apiKey: string,
    readonly model: string = "mistral-small-latest",
    private readonly fetchFn: FetchLike = fetch,
    // Last, and defaulted, so that a call site which forgets it gets the
    // endpoint we can stand behind rather than the one we cannot.
    private readonly baseUrl: string = MISTRAL_EU_BASE_URL,
  ) {}

  /** The host being called, for an error a person has to act on. */
  private host(): string {
    try {
      return new URL(this.baseUrl).host;
    } catch {
      return this.baseUrl;
    }
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
    });

    // One retry on 429. Mistral answers 429 both for a real rate limit
    // and for "capacity exceeded", which on the lower tiers means the
    // model was busy for a second; a person pressing a button once should
    // not be told to try again for that.
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
      } catch {
        throw new LlmError("unreachable", "mistral: network error or timeout");
      }

      if (response.status === 401 || response.status === 403) {
        throw new LlmError("auth", "mistral: the API key was rejected");
      }
      if (response.status === 429) {
        const message = await apiMessage(response);
        if (attempt === 0) {
          const after = Number(response.headers.get("retry-after"));
          await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1500, 5000));
          continue;
        }
        throw new LlmError("rate_limit", `mistral: rate limited (429): ${message}`);
      }
      if (!response.ok) {
        throw new LlmError(
          "bad_response",
          `mistral: HTTP ${response.status}: ${await apiMessage(response)}`,
        );
      }

      let payload: ChatResponse;
      try {
        payload = (await response.json()) as ChatResponse;
      } catch {
        throw new LlmError("bad_response", "mistral: malformed response body");
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LlmError("bad_response", "mistral: response carried no content");
      }
      return {
        content,
        model: payload.model ?? this.model,
        usage:
          payload.usage?.prompt_tokens != null
            ? {
                inputTokens: payload.usage.prompt_tokens ?? 0,
                outputTokens: payload.usage.completion_tokens ?? 0,
              }
            : null,
      };
    }
  }

  /** GET /models validates the key and reachability without token spend. */
  async healthCheck(): Promise<LlmHealth> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, reason: "unreachable", detail: `${this.host()} did not answer` };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "auth", detail: "the API key was rejected" };
    }
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
    }
    // The key works; now the one thing left to get wrong is the model
    // name, and the list we just fetched says whether it exists.
    try {
      const body = (await response.json()) as { data?: Array<{ id?: string }> };
      const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      if (ids.length > 0 && !ids.includes(this.model)) {
        const shown = ids
          .filter((id) => /latest$/.test(id))
          .slice(0, 8)
          .join(", ");
        return {
          ok: false,
          reason: "config",
          detail: `model ${this.model} is not one this key can use. Available: ${shown || ids.slice(0, 8).join(", ")}`,
        };
      }
    } catch {
      // A list we cannot read is not a reason to call a working key broken.
    }
    return { ok: true, detail: `authenticated, model ${this.model}` };
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Mistral answers errors as JSON with a message that says what was
 * wrong: an unknown model, a bad parameter, a key from the wrong product.
 * That sentence is worth more than the status code, and carries no secret.
 */
async function apiMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { message?: unknown; detail?: unknown; error?: unknown };
      const message = body.message ?? body.detail ?? body.error;
      return (typeof message === "string" ? message : JSON.stringify(message)).slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return "no body";
  }
}
