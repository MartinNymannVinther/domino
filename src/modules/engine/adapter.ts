import type { LlmProvider } from "@/core/llm/types";
import type { ModelAdapter } from "./types";

/**
 * A provider from src/core/llm, seen the way the engine wants to see it.
 * Only the types are imported: this file, like the rest of the engine,
 * opens no pool and reads no environment, so it can be built in a test
 * with a fake provider and in the runner with a real one.
 */
export function providerAdapter(provider: LlmProvider): ModelAdapter {
  return {
    engine: `${provider.id}:${provider.model}`,
    async complete(request) {
      // Local models load slowly the first time; a hosted one answers in seconds.
      const timeoutMs = provider.id === "ollama" ? 240_000 : 90_000;
      const completion = await provider.complete(
        [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        {
          responseFormat: request.json ? "json" : "text",
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          timeoutMs,
        },
      );
      return { content: completion.content, usage: completion.usage };
    },
  };
}
