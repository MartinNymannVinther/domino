import { describe, expect, it } from "vitest";
import { OllamaProvider } from "@/core/llm/ollama";

/** A stand-in for Ollama, so the health check can be pinned without one. */
function fakeOllama(models: string[]) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/tags"))
      return new Response(JSON.stringify({ models: models.map((name) => ({ name })) }), {
        status: 200,
      });
    return new Response("not found", { status: 404 });
  };
}

describe("the Ollama health check", () => {
  it("names the models the machine has when the configured one is missing", async () => {
    const provider = new OllamaProvider(
      "http://localhost:11434",
      "llama3.2",
      fakeOllama(["gemma3:27b", "qwen2.5:14b"]) as typeof fetch,
    );
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("llama3.2 is not pulled");
    expect(health.detail).toContain("gemma3:27b");
    expect(health.detail).toContain("qwen2.5:14b");
    expect(health.detail).toContain("LLM_MODEL");
  });

  it("says so plainly when Ollama has nothing at all", async () => {
    const provider = new OllamaProvider(
      "http://localhost:11434",
      "llama3.2",
      fakeOllama([]) as typeof fetch,
    );
    const health = await provider.healthCheck();
    expect(health.detail).toContain("no models at all");
  });

  it("accepts a model named with its tag", async () => {
    const provider = new OllamaProvider(
      "http://localhost:11434",
      "gemma3",
      fakeOllama(["gemma3:27b"]) as typeof fetch,
    );
    expect((await provider.healthCheck()).ok).toBe(true);
  });

  it("reports an unreachable endpoint rather than guessing", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2", (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health).toMatchObject({ reason: "unreachable" });
  });
});
