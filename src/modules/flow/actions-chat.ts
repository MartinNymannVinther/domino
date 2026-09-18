"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import { MAX_MESSAGE_CHARS } from "@/modules/ai/propose-change";
import type { PatchOutcome } from "./actions";
import { acceptProposal, recordExchange, rejectProposal } from "./messages";
import { Patch } from "./patch";

/**
 * The conversation's writes (docs/adr/0008: acceptances are actions).
 * The model's turn itself happens on the flow-chat route; what is
 * stored here is the exchange as it went, and the person's yes or no
 * to what was proposed. Every id is looked up inside the workspace.
 */

const FlowId = z.string().min(1).max(64);

export async function recordExchangeAction(raw: unknown): Promise<Result<{ assistantId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({
      flowId: FlowId,
      user: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      assistant: z.string().max(2000),
      engine: z.string().max(120),
      proposal: z.object({ baseVersionId: z.string().min(1).max(64), patch: Patch }).nullable(),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, ...exchange } = parsed.data;
  return ok(await recordExchange(ctx, flowId, exchange));
}

export async function acceptProposalAction(raw: unknown): Promise<Result<PatchOutcome>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: FlowId, messageId: z.string().min(1).max(64) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await acceptProposal(ctx, parsed.data.flowId, parsed.data.messageId);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/flows/${parsed.data.flowId}`);
  return ok({ versionId: result.versionId, number: result.number, document: result.document });
}

export async function rejectProposalAction(raw: unknown): Promise<Result> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: FlowId, messageId: z.string().min(1).max(64) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await rejectProposal(ctx, parsed.data.flowId, parsed.data.messageId);
  return done ? ok(undefined) : fail("notFound");
}
