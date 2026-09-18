import { eq } from "drizzle-orm";
import { z } from "zod";
import { openSecret, sealSecret } from "@/core/crypto/secret-box";
import { workspaceLlmSettings } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import {
  DEFAULT_MODEL,
  installationLlmConfig,
  llmProviderFrom,
  type LlmConfig,
  type LlmProvider,
  type LlmProviderId,
} from "@/core/llm";

/**
 * Which model a workspace uses. The installation's .env is the default
 * everybody inherits; a workspace that wants something else says so here
 * and its choice wins for its own rows only.
 *
 * Two things stay with the installation on purpose. The Ollama address,
 * because a workspace-chosen URL would make the server fetch whatever a
 * member points it at. And the fallback key: a workspace on Mistral
 * without its own key keeps using the installation's, which is what makes
 * "change the model, keep the key" a one-field change.
 */

export const ProviderChoice = z.enum(["inherit", "mistral", "ollama", "none"]);
export type ProviderChoice = z.infer<typeof ProviderChoice>;

export const SaveModelSettingsInput = z.object({
  provider: ProviderChoice,
  // Empty means "the provider's default model", which the UI shows.
  model: z.string().trim().max(120).default(""),
  // "keep" leaves the stored key alone, "clear" removes it, a string sets it.
  apiKey: z.union([z.literal("keep"), z.literal("clear"), z.string().trim().min(1).max(400)]),
});
export type SaveModelSettingsInput = z.infer<typeof SaveModelSettingsInput>;

/** What the settings page needs: the choice, and whether a key is stored. */
export type ModelSettingsView = {
  choice: ProviderChoice;
  model: string;
  hasOwnKey: boolean;
  updatedAt: string | null;
  /** The configuration actually in force, after inheritance. */
  effective: {
    provider: LlmProviderId;
    model: string;
    keyFrom: "workspace" | "installation" | "none";
  };
  installation: { provider: LlmProviderId; model: string };
};

async function readRow(ctx: OrgContext) {
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .select()
      .from(workspaceLlmSettings)
      .where(eq(workspaceLlmSettings.orgId, ctx.orgId))
      .limit(1),
  );
  return row ?? null;
}

function defaultModelFor(provider: LlmProviderId): string {
  return provider === "none" ? "" : DEFAULT_MODEL[provider];
}

/**
 * The configuration in force for this workspace. A stored key that cannot
 * be opened — the auth secret was rotated, the column was truncated — is
 * treated as no key at all, so the workspace falls back to the
 * installation instead of failing every AI call with a decryption error.
 */
export async function resolveLlmConfig(ctx: OrgContext): Promise<LlmConfig> {
  const installation = installationLlmConfig();
  const row = await readRow(ctx);
  if (!row) return installation;

  const provider = row.provider as LlmProviderId;
  const ownKey = openSecret(row.apiKeyCipher, ctx.orgId);
  return {
    provider,
    model: row.model ?? (provider === installation.provider ? installation.model : null),
    apiKey: ownKey ?? installation.apiKey,
  };
}

/** The provider this workspace should use, or null when nothing can answer. */
export async function workspaceLlmProvider(ctx: OrgContext): Promise<LlmProvider | null> {
  return llmProviderFrom(await resolveLlmConfig(ctx));
}

export async function getModelSettings(ctx: OrgContext): Promise<ModelSettingsView> {
  const installation = installationLlmConfig();
  const row = await readRow(ctx);
  const effectiveConfig = await resolveLlmConfig(ctx);
  const hasOwnKey = Boolean(row && openSecret(row.apiKeyCipher, ctx.orgId));

  return {
    choice: row ? (row.provider as ProviderChoice) : "inherit",
    model: row?.model ?? "",
    hasOwnKey,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    effective: {
      provider: effectiveConfig.provider,
      model: effectiveConfig.model?.trim() || defaultModelFor(effectiveConfig.provider),
      keyFrom:
        effectiveConfig.provider !== "mistral"
          ? "none"
          : hasOwnKey
            ? "workspace"
            : effectiveConfig.apiKey
              ? "installation"
              : "none",
    },
    installation: {
      provider: installation.provider,
      model: installation.model?.trim() || defaultModelFor(installation.provider),
    },
  };
}

/**
 * Saves the workspace's choice. "inherit" removes the row entirely, key
 * included: going back to the installation's model should not leave a
 * secret behind in a table nobody looks at any more.
 */
export async function saveModelSettings(
  ctx: OrgContext,
  input: SaveModelSettingsInput,
): Promise<void> {
  if (input.provider === "inherit") {
    await withOrgContext(ctx, (tx) =>
      tx.delete(workspaceLlmSettings).where(eq(workspaceLlmSettings.orgId, ctx.orgId)),
    );
    return;
  }

  const existing = await readRow(ctx);
  const cipher =
    input.apiKey === "keep"
      ? (existing?.apiKeyCipher ?? null)
      : input.apiKey === "clear"
        ? null
        : sealSecret(input.apiKey, ctx.orgId);
  // Ollama has no key to hold; storing one would be a secret kept for
  // nothing, and a surprise the day somebody switches provider back.
  const apiKeyCipher = input.provider === "mistral" ? cipher : null;
  const model = input.model.trim() || null;

  await withOrgContext(ctx, async (tx) => {
    if (existing) {
      await tx
        .update(workspaceLlmSettings)
        .set({
          provider: input.provider,
          model,
          apiKeyCipher,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(workspaceLlmSettings.orgId, ctx.orgId));
      return;
    }
    await tx.insert(workspaceLlmSettings).values({
      orgId: ctx.orgId,
      provider: input.provider,
      model,
      apiKeyCipher,
      updatedBy: ctx.userId,
    });
  });
}
