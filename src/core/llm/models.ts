/**
 * Default model names, kept apart from the provider registry so the
 * settings form can name them without pulling the server's environment
 * and the Postgres client into the browser bundle.
 */
export const DEFAULT_MODEL = {
  mistral: "mistral-small-latest",
  ollama: "llama3.2",
} as const;

export type LlmProviderId = "mistral" | "ollama" | "none";
