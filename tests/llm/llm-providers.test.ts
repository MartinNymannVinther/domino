import { describe, expect, it } from "vitest";
import { MISTRAL_EU_BASE_URL, MistralProvider } from "@/core/llm/mistral";
import { OllamaProvider } from "@/core/llm/ollama";
import { LlmError } from "@/core/llm/types";

function fetchReturning(
  body: unknown,
  status = 200,
): {
  fetchFn: typeof fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchFn, calls };
}

const failingFetch: typeof fetch = async () => {
  throw new Error("down");
};

/**
 * Where the prompts go, asserted rather than assumed.
 *
 * Mistral's api.mistral.ai carries no commitment about where inference
 * happens; api.eu.mistral.ai does. docs/subprocessors.md tells the people
 * whose names are in those prompts that they go to the EU, and dogma four
 * says the same. This is the test that keeps the sentence true.
 */
describe("the Mistral endpoint", () => {
  it("is the EU one unless the installation says otherwise", async () => {
    expect(MISTRAL_EU_BASE_URL).toBe("https://api.eu.mistral.ai/v1");
    const { fetchFn, calls } = fetchReturning({ data: [] });
    await new MistralProvider("k", "m", fetchFn).healthCheck();
    expect(calls[0]!.url.startsWith(MISTRAL_EU_BASE_URL)).toBe(true);
  });

  it("never falls back to the endpoint with no location commitment", async () => {
    const { fetchFn, calls } = fetchReturning({ data: [] });
    await new MistralProvider("k", "m", fetchFn).healthCheck();
    expect(calls[0]!.url).not.toContain("//api.mistral.ai");
  });

  it("names the host it could not reach, whichever one it is", async () => {
    const provider = new MistralProvider("k", "m", failingFetch, "https://api.us.mistral.ai/v1");
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.ok === false && health.detail).toContain("api.us.mistral.ai");
  });
});

describe("MistralProvider", () => {
  const okBody = {
    model: "mistral-small-latest",
    choices: [{ message: { content: "Hej Martin" } }],
    usage: { prompt_tokens: 12, completion_tokens: 3 },
  };

  it("sends bearer auth, model and messages; maps the completion", async () => {
    const { fetchFn, calls } = fetchReturning(okBody);
    const provider = new MistralProvider("secret-key", "mistral-small-latest", fetchFn);
    const result = await provider.complete([{ role: "user", content: "Sig hej" }]);

    expect(result.content).toBe("Hej Martin");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    const call = calls[0]!;
    expect(call.url).toBe("https://api.eu.mistral.ai/v1/chat/completions");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(String(call.init?.body));
    expect(body.model).toBe("mistral-small-latest");
    expect(body.messages).toEqual([{ role: "user", content: "Sig hej" }]);
    expect(body.response_format).toBeUndefined();
  });

  it("asks for a json object in json mode", async () => {
    const { fetchFn, calls } = fetchReturning(okBody);
    const provider = new MistralProvider("k", "m", fetchFn);
    await provider.complete([{ role: "user", content: "x" }], { responseFormat: "json" });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("maps auth, rate limit and network failures to typed errors", async () => {
    const auth = new MistralProvider("bad", "m", fetchReturning({}, 401).fetchFn);
    await expect(auth.complete([{ role: "user", content: "x" }])).rejects.toMatchObject({
      reason: "auth",
    });

    const limited = fetchReturning({ message: "Service tier capacity exceeded" }, 429);
    const limitedProvider = new MistralProvider("k", "m", limited.fetchFn);
    const error = await limitedProvider.complete([{ role: "user", content: "x" }]).catch((e) => e);
    expect(error).toMatchObject({ reason: "rate_limit" });
    // Mistral's own sentence comes through, and a 429 was tried twice.
    expect(String(error.message)).toContain("capacity exceeded");
    expect(limited.calls).toHaveLength(2);

    const down = new MistralProvider("k", "m", failingFetch);
    await expect(down.complete([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
  });

  it("recovers when the second try after a 429 succeeds", async () => {
    let n = 0;
    const fetchFn: typeof fetch = async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ message: "busy" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "0" },
          })
        : new Response(JSON.stringify(okBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
    };
    const provider = new MistralProvider("k", "m", fetchFn);
    const result = await provider.complete([{ role: "user", content: "x" }]);
    expect(result.content).toBe("Hej Martin");
    expect(n).toBe(2);
  });

  it("errors never contain the API key", async () => {
    for (const provider of [
      new MistralProvider("super-secret-key", "m", fetchReturning({}, 401).fetchFn),
      new MistralProvider("super-secret-key", "m", failingFetch),
    ]) {
      const error = await provider.complete([{ role: "user", content: "x" }]).catch((e) => e);
      expect(String(error.message)).not.toContain("super-secret-key");
    }
  });

  it("health check probes /models without spending tokens", async () => {
    const { fetchFn, calls } = fetchReturning({ data: [] });
    const provider = new MistralProvider("k", "m", fetchFn);
    expect((await provider.healthCheck()).ok).toBe(true);
    expect(calls[0]!.url).toBe("https://api.eu.mistral.ai/v1/models");

    const bad = new MistralProvider("bad", "m", fetchReturning({}, 401).fetchFn);
    expect(await bad.healthCheck()).toMatchObject({ ok: false, reason: "auth" });
  });
});

describe("OllamaProvider", () => {
  it("talks to the local endpoint and maps the completion", async () => {
    const { fetchFn, calls } = fetchReturning({
      model: "llama3.2",
      message: { content: "Hej" },
      prompt_eval_count: 8,
      eval_count: 2,
    });
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2", fetchFn);
    const result = await provider.complete([{ role: "user", content: "Sig hej" }], {
      responseFormat: "json",
    });
    expect(result.content).toBe("Hej");
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 2 });
    const call = calls[0]!;
    expect(call.url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(String(call.init?.body));
    expect(body.stream).toBe(false);
    expect(body.format).toBe("json");
  });

  it("health check flags a model that is not pulled", async () => {
    const { fetchFn } = fetchReturning({ models: [{ name: "mistral:7b" }] });
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2", fetchFn);
    expect(await provider.healthCheck()).toMatchObject({ ok: false, reason: "config" });

    const { fetchFn: goodFetch } = fetchReturning({ models: [{ name: "llama3.2:latest" }] });
    const good = new OllamaProvider("http://localhost:11434", "llama3.2", goodFetch);
    expect((await good.healthCheck()).ok).toBe(true);

    const down = new OllamaProvider("http://localhost:11434", "llama3.2", failingFetch);
    expect(await down.healthCheck()).toMatchObject({ ok: false, reason: "unreachable" });
  });
});
