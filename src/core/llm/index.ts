import { env } from "@/core/env";
import { MistralProvider } from "./mistral";
import { OllamaProvider } from "./ollama";
import { DEFAULT_MODEL, type LlmProviderId } from "./models";
import type { LlmProvider } from "./types";

export { LlmError } from "./types";
export type {
  LlmCompletion,
  LlmCompletionOptions,
  LlmHealth,
  LlmMessage,
  LlmProvider,
} from "./types";

export { DEFAULT_MODEL } from "./models";
export type { LlmProviderId } from "./models";

/**
 * What a provider needs to exist. Neither address is part of it on
 * purpose: both the Ollama address and the Mistral endpoint come from the
 * environment, so no caller — a workspace setting included — can point
 * the server at an address of its choosing, or move where a project's
 * text is processed.
 */
export type LlmConfig = {
  provider: LlmProviderId;
  model?: string | null;
  apiKey?: string | null;
};

/** The installation's own configuration, from .env. */
export function installationLlmConfig(): LlmConfig {
  return {
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL ?? null,
    apiKey: env.MISTRAL_API_KEY ?? null,
  };
}

/**
 * Builds a provider from a resolved configuration. Returns null when AI is
 * off, and also when a hosted provider has no key at all: a configuration
 * that cannot answer is the same thing as no configuration, and callers
 * already answer by saying there is no model.
 */
export function llmProviderFrom(config: LlmConfig): LlmProvider | null {
  switch (config.provider) {
    case "mistral": {
      const key = config.apiKey?.trim();
      if (!key) return null;
      return new MistralProvider(
        key,
        config.model?.trim() || DEFAULT_MODEL.mistral,
        fetch,
        env.MISTRAL_BASE_URL,
      );
    }
    case "ollama":
      return new OllamaProvider(env.OLLAMA_BASE_URL, config.model?.trim() || DEFAULT_MODEL.ollama);
    case "none":
      return null;
  }
}

/**
 * Provider registry, same pattern as the CVR adapter: the environment
 * decides, features just ask. Returns null when AI is disabled
 * (LLM_PROVIDER=none, the default) — callers must handle that and
 * degrade gracefully. A workspace that chose its own model goes through
 * `resolveLlmConfig` in src/modules/ai/model-settings instead.
 */
export function getLlmProvider(): LlmProvider | null {
  return llmProviderFrom(installationLlmConfig());
}
