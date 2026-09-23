"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import { exampleFlow } from "./examples";
import { MAX_IMPORT_BYTES } from "./io";
import { Patch } from "./patch";
import type { Problem } from "./problems";
import { FlowDocument } from "./schema";
import { archiveFlow, createFlow, deleteFlow, importFlow } from "./service";
import {
  commitPatch,
  listVersions,
  revertToVersion,
  versionIdByNumber,
  type VersionSummary,
} from "./versions";

/**
 * The write boundary for flows (CLAUDE.md, security rules): every
 * action resolves the session and workspace first, validates what it
 * was handed with zod, and answers with a Result the interface can say
 * in the reader's language. Ids are never trusted — the service finds
 * the flow inside the workspace context or does not.
 */

const FlowId = z.string().min(1).max(64);

/** A flow to start from: an example, a file, or the smallest flow that runs. */
const NewFlowInput = z.discriminatedUnion("from", [
  z.object({ from: z.literal("example"), key: z.string().min(1).max(40) }),
  z.object({ from: z.literal("blank") }),
  z.object({
    from: z.literal("document"),
    document: z.unknown(),
    /** A document the model proposed and the person accepted on the start screen. */
    proposedByAi: z.boolean().default(false),
    note: z.string().max(200).default(""),
  }),
]);

const BLANK: FlowDocument = FlowDocument.parse({
  format: "domino.flow",
  version: 1,
  name: "Nyt flow",
  description: "",
  nodes: [
    {
      id: "n1",
      type: "input",
      title: "Tekst",
      config: { kind: "text", itemKind: "text", label: "Tekst", hint: "" },
    },
    { id: "n2", type: "output", title: "Resultat", config: { kind: "text", label: "Resultat" } },
  ],
  edges: [{ id: "e1", from: { node: "n1", port: "value" }, to: { node: "n2", port: "value" } }],
});

export async function createFlowAction(raw: unknown): Promise<Result<{ flowId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = NewFlowInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  const document =
    input.from === "blank"
      ? BLANK
      : input.from === "example"
        ? exampleFlow(input.key)
        : input.document;
  if (!document) return fail("notFound");
  const created = await createFlow(ctx, document, {
    actorKind: input.from === "document" && input.proposedByAi ? "ai" : "user",
    message: input.from === "example" ? "eksempel" : input.from === "document" ? input.note : "",
  });
  if (!created.ok) return fail("invalid", created.problems[0]);
  revalidatePath("/flows");
  return ok({ flowId: created.flowId });
}

export async function importFlowAction(raw: unknown): Promise<Result<{ flowId: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ text: z.string().max(MAX_IMPORT_BYTES) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const imported = await importFlow(ctx, parsed.data.text);
  if (!imported.ok) return fail("invalid", imported.result.ok ? undefined : imported.result.reason);
  revalidatePath("/flows");
  return ok({ flowId: imported.flowId });
}

export type PatchOutcome = {
  versionId: string;
  number: number;
  document: FlowDocument;
};

export type PatchFailure = { problems?: Problem[]; at?: number };

/**
 * A change from the canvas or the panel. The patch is validated as a
 * patch, applied to the version the client saw, and refused as a
 * conflict if that version is no longer current.
 */
export async function commitPatchAction(
  raw: unknown,
): Promise<Result<PatchOutcome> & PatchFailure> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({
      flowId: FlowId,
      baseVersionId: z.string().min(1).max(64),
      patch: Patch,
      message: z.string().max(200).default(""),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, baseVersionId, patch, message } = parsed.data;
  const result = await commitPatch(ctx, flowId, patch, {
    actorKind: "user",
    message,
    baseVersionId,
  });
  if (!result.ok) {
    return { ...fail(result.error), problems: result.problems, at: result.at };
  }
  revalidatePath(`/flows/${flowId}`);
  revalidatePath("/flows");
  return ok({ versionId: result.versionId, number: result.number, document: result.document });
}

export async function revertAction(raw: unknown): Promise<Result<PatchOutcome>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({ flowId: FlowId, versionId: z.string().min(1).max(64), message: z.string().max(200) })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, versionId, message } = parsed.data;
  const result = await revertToVersion(ctx, flowId, versionId, message);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/flows/${flowId}`);
  return ok({ versionId: result.versionId, number: result.number, document: result.document });
}

/** One step back: the version before the one in hand, as a new version. */
export async function undoAction(raw: unknown): Promise<Result<PatchOutcome>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({
      flowId: FlowId,
      currentNumber: z.number().int().min(2),
      message: z.string().max(200),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, currentNumber, message } = parsed.data;
  const versionId = await versionIdByNumber(ctx, flowId, currentNumber - 1);
  if (!versionId) return fail("notFound");
  const result = await revertToVersion(ctx, flowId, versionId, message);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/flows/${flowId}`);
  return ok({ versionId: result.versionId, number: result.number, document: result.document });
}

export async function listVersionsAction(raw: unknown): Promise<Result<VersionSummary[]>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: FlowId }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  return ok(await listVersions(ctx, parsed.data.flowId));
}

export async function archiveFlowAction(raw: unknown): Promise<Result> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: FlowId, archived: z.boolean() }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await archiveFlow(ctx, parsed.data.flowId, parsed.data.archived);
  if (!done) return fail("notFound");
  revalidatePath("/flows");
  return ok(undefined);
}

export async function deleteFlowAction(raw: unknown): Promise<Result> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: FlowId }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await deleteFlow(ctx, parsed.data.flowId);
  if (!done) return fail("notFound");
  revalidatePath("/flows");
  return ok(undefined);
}
