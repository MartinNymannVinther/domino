"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import { cancelRun, startRun, type StartResult } from "./service";

/**
 * Starting and stopping runs (CLAUDE.md, security rules): the session
 * and workspace first, the ids looked up inside it, the input validated
 * against the flow by the service. The run itself happens in the runner.
 */

const Id = z.string().min(1).max(64);

export async function startRunAction(
  raw: unknown,
): Promise<Result<{ runId: string }> & { reason?: Exclude<StartResult, { ok: true }>["reason"] }> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({ flowId: Id, mode: z.enum(["test", "full"]), input: z.unknown() })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await startRun(ctx, parsed.data.flowId, parsed.data.mode, parsed.data.input);
  if (!result.ok)
    return {
      ...fail(result.reason === "notFound" ? "notFound" : "invalid"),
      reason: result.reason,
    };
  revalidatePath(`/flows/${parsed.data.flowId}/runs`);
  return ok({ runId: result.runId });
}

export async function cancelRunAction(raw: unknown): Promise<Result> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ runId: Id }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await cancelRun(ctx, parsed.data.runId);
  return done ? ok(undefined) : fail("notFound");
}
