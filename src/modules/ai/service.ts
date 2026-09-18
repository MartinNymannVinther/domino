import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { LlmError, type LlmMessage } from "@/core/llm";
import { reserveAiCall, type AiKind } from "./limits";
import { workspaceLlmProvider } from "./model-settings";
import { parseModelJson } from "./parse-json";
import type { AiFailure } from "./wire";

/** The word the interface shows for why the model did not answer. */
export type { AiFailure };

/**
 * One door to the model for every feature: the workspace's provider,
 * the call counted against the ceilings, the wait bounded, and the
 * answer parsed. There is no rules engine behind it — a board tool can
 * do its whole job without a model, so when none is configured the
 * buttons say so instead of pretending.
 */

export class NoModel extends Error {
  constructor() {
    super("no model");
    this.name = "NoModel";
  }
}

export type ModelAnswer = { data: unknown; engine: string };

/** True when a model is configured for this workspace, for the UI. */
export async function modelConfigured(ctx: OrgContext): Promise<boolean> {
  return (await workspaceLlmProvider(ctx)) !== null;
}

export async function askForJson(
  ctx: OrgContext,
  kind: AiKind,
  messages: LlmMessage[],
  options: { maxTokens?: number } = {},
): Promise<ModelAnswer> {
  const provider = await workspaceLlmProvider(ctx);
  if (!provider) throw new NoModel();
  const engine = `${provider.id}:${provider.model}`;
  await withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, kind, engine));
  // Local models load slowly the first time; a hosted one answers in seconds.
  const timeoutMs = provider.id === "ollama" ? 240_000 : 60_000;
  const completion = await provider.complete(messages, {
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: options.maxTokens ?? 1200,
    timeoutMs,
  });
  const data = parseModelJson(completion.content);
  if (data === null) throw new LlmError("bad_response", "the model did not answer with JSON");
  return { data, engine };
}

export function classifyAiError(error: unknown): AiFailure {
  if (error instanceof NoModel) return "noModel";
  if (error instanceof Error && error.name === "RateLimited") return "rateLimited";
  if (error instanceof LlmError) {
    if (error.reason === "unreachable" || error.reason === "auth") return "unreachable";
    if (error.reason === "rate_limit") return "rateLimited";
    return "badAnswer";
  }
  console.error("ai: call failed", error);
  return "generic";
}
