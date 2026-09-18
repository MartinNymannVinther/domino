"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import { deleteWorkspace, type DeleteResult } from "./workspace";

/**
 * Dogma three's exit door. The export itself is a download and lives in a
 * route handler; deletion is an action, because it ends with the person
 * being sent somewhere else.
 */

export async function deleteWorkspaceAction(raw: unknown): Promise<Result<DeleteResult>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await deleteWorkspace(ctx, parsed.data.name, await headers());
  if (result === "deleted") redirect("/");
  return ok(result);
}
