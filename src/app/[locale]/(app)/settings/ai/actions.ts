"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/core/auth/guard";
import { withOrgContext } from "@/core/db/tenant";
import { LlmError } from "@/core/llm";
import { RateLimited, reserveAiCall } from "@/modules/ai/limits";
import {
  getModelSettings,
  saveModelSettings,
  SaveModelSettingsInput,
  workspaceLlmProvider,
  type ModelSettingsView,
} from "@/modules/ai/model-settings";
import { currentRole } from "@/modules/export/workspace";

export type LlmTestResult =
  | { status: "none" }
  | { status: "unauthorized" }
  | { status: "ok"; model: string; sample: string; ms: number }
  | {
      status: "failed";
      reason: "auth" | "unreachable" | "config" | "rate_limit" | "ceiling" | "generic";
    };

/**
 * Two steps, because they fail for different reasons and a person needs
 * to know which. First a token-free health check: is anything listening,
 * and does it have the model the workspace asked for. Then one real
 * completion, so the whole path — request, model, JSON parsing — is
 * proven rather than assumed.
 *
 * This exists because the settings page could otherwise say a model is
 * configured while every call quietly failed and every AI surface said
 * there was no model. "Configured" and "working" are different claims,
 * and only one of them is worth making.
 *
 * Owners and admins only, and counted like any other model call. It
 * spends the workspace's money, and the provider's own error text names
 * the installation's Ollama address and the models on it — neither is a
 * member's business, so what comes back is the category and nothing more.
 * The detail is logged where an operator can read it.
 */
export async function testLlmAction(): Promise<LlmTestResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { status: "unauthorized" };
  const role = await currentRole(ctx);
  if (role !== "owner" && role !== "admin") return { status: "unauthorized" };

  const provider = await workspaceLlmProvider(ctx);
  if (!provider) return { status: "none" };

  try {
    await withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, "test", "test"));
  } catch (error) {
    // Our own ceiling, not the provider's: the person is told which, or
    // they go looking for a billing page over a limit we set ourselves.
    if (error instanceof RateLimited) return { status: "failed", reason: "ceiling" };
    console.error("llm: could not count the test call", error);
    return { status: "failed", reason: "generic" };
  }

  const health = await provider.healthCheck();
  if (!health.ok) {
    console.error("llm: health check failed", health.reason, health.detail);
    return { status: "failed", reason: health.reason };
  }

  const started = Date.now();
  try {
    const completion = await provider.complete(
      [{ role: "user", content: "Svar med præcis ét ord: OK" }],
      // Generous, because a local model that has not been asked anything
      // for a while reads itself off disk first, and that is not a fault.
      { maxTokens: 10, temperature: 0, timeoutMs: 120_000 },
    );
    return {
      status: "ok",
      model: completion.model,
      sample: completion.content.trim().slice(0, 80),
      ms: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof LlmError) {
      const reason =
        error.reason === "auth"
          ? "auth"
          : error.reason === "unreachable"
            ? "unreachable"
            : error.reason === "rate_limit"
              ? "rate_limit"
              : "generic";
      console.error("llm: test failed", error.message);
      return { status: "failed", reason };
    }
    console.error("llm: test failed", error);
    return { status: "failed", reason: "generic" };
  }
}

export type SaveResult =
  | { ok: true; settings: ModelSettingsView }
  | { ok: false; error: "unauthorized" | "invalid" | "generic" };

/**
 * Owners and admins only. The model choice spends the workspace's money
 * and holds its key; a member who can edit tasks has no business changing
 * either, and the check lives here rather than in the form.
 */
export async function saveModelSettingsAction(input: unknown): Promise<SaveResult> {
  const ctx = await requireOrgContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const role = await currentRole(ctx);
  if (role !== "owner" && role !== "admin") return { ok: false, error: "unauthorized" };

  const parsed = SaveModelSettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    await saveModelSettings(ctx, parsed.data);
    revalidatePath("/settings/ai");
    return { ok: true, settings: await getModelSettings(ctx) };
  } catch (error) {
    console.error("llm: saving workspace model settings failed", error);
    return { ok: false, error: "generic" };
  }
}
