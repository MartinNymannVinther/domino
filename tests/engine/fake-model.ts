import type { ModelAdapter, ModelRequest } from "@/modules/engine";

/**
 * A model that answers from a script, so the engine can be proven
 * without one. Each call is remembered with the request it saw, which
 * is how a test checks that a document's text arrived fenced and a
 * schema arrived in the system prompt.
 */
export function fakeModel(
  answer: (request: ModelRequest, call: number) => string,
): ModelAdapter & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    engine: "fake:test",
    calls,
    async complete(request) {
      calls.push(request);
      return {
        content: answer(request, calls.length),
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
  };
}

/** Files the document brick can read, keyed by id. */
export function fakeFiles(texts: Record<string, string>) {
  return async (fileId: string) => {
    const text = texts[fileId];
    return text === undefined ? { error: "no text was extracted" } : { text };
  };
}
