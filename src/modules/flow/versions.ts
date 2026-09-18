import { asc, eq, sql } from "drizzle-orm";
import { flows, flowVersions, type ActorKind } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { diffDocuments } from "./diff";
import { applyPatch, type Patch } from "./patch";
import type { Problem } from "./problems";
import type { FlowDocument } from "./schema";
import { readFlow } from "./service";
import { parseDocument } from "./validate";

/**
 * How a flow changes (docs/adr/0011): a patch applied to the current
 * version, validated whole, stored as the next version with the patch
 * beside the document. Undo is the same thing with the older document
 * wanted back and the diff as its patch; nothing is deleted from the
 * history.
 *
 * A change names the version it was made against. If the canvas has
 * moved on since — a colleague, another tab — the change is refused as
 * a conflict rather than landed on a document it never saw.
 */

export type VersionSummary = {
  id: string;
  number: number;
  actorKind: ActorKind;
  message: string;
  patch: Patch | null;
  createdAt: Date;
};

export type CommitResult =
  | { ok: true; versionId: string; number: number; document: FlowDocument }
  | { ok: false; error: "notFound" | "conflict" | "invalid"; problems?: Problem[]; at?: number };

export async function commitPatch(
  ctx: OrgContext,
  flowId: string,
  patch: Patch,
  options: { actorKind: ActorKind; message: string; baseVersionId?: string },
): Promise<CommitResult> {
  return withOrgContext(ctx, async (tx) => {
    const flow = await lockFlow(tx, flowId);
    if (!flow) return { ok: false, error: "notFound" };
    if (options.baseVersionId && options.baseVersionId !== flow.version.id)
      return { ok: false, error: "conflict" };
    const applied = applyPatch(flow.document, patch);
    if (!applied.ok)
      return { ok: false, error: "invalid", problems: applied.problems, at: applied.at };
    return writeVersion(tx, ctx, flow, applied.document, patch, options);
  });
}

/** Every version, oldest first, with what changed. */
export async function listVersions(ctx: OrgContext, flowId: string): Promise<VersionSummary[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: flowVersions.id,
        number: flowVersions.number,
        actorKind: flowVersions.actorKind,
        message: flowVersions.message,
        patch: flowVersions.patch,
        createdAt: flowVersions.createdAt,
      })
      .from(flowVersions)
      .where(eq(flowVersions.flowId, flowId))
      .orderBy(asc(flowVersions.number));
    return rows.map((r) => ({
      ...r,
      actorKind: r.actorKind as ActorKind,
      patch: (r.patch as Patch | null) ?? null,
    }));
  });
}

export async function getVersionDocument(
  ctx: OrgContext,
  flowId: string,
  versionId: string,
): Promise<{ number: number; document: FlowDocument } | null> {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .select({ number: flowVersions.number, document: flowVersions.document })
      .from(flowVersions)
      .where(sql`${flowVersions.id} = ${versionId} and ${flowVersions.flowId} = ${flowId}`)
      .limit(1);
    if (!row) return null;
    const parsed = parseDocument(row.document);
    return parsed.ok ? { number: row.number, document: parsed.document } : null;
  });
}

/**
 * Back to an older version: a new version whose document is the old
 * one's, with the diff from the current as its patch so the history
 * draws it like any other change.
 */
export async function revertToVersion(
  ctx: OrgContext,
  flowId: string,
  versionId: string,
  message: string,
): Promise<CommitResult> {
  return withOrgContext(ctx, async (tx) => {
    const flow = await lockFlow(tx, flowId);
    if (!flow) return { ok: false, error: "notFound" };
    const [older] = await tx
      .select({ number: flowVersions.number, document: flowVersions.document })
      .from(flowVersions)
      .where(sql`${flowVersions.id} = ${versionId} and ${flowVersions.flowId} = ${flowId}`)
      .limit(1);
    if (!older) return { ok: false, error: "notFound" };
    const parsed = parseDocument(older.document);
    if (!parsed.ok) return { ok: false, error: "invalid", problems: parsed.problems };
    const patch = diffDocuments(flow.document, parsed.document);
    if (!patch)
      return {
        ok: true,
        versionId: flow.version.id,
        number: flow.version.number,
        document: flow.document,
      };
    return writeVersion(tx, ctx, flow, parsed.document, patch, { actorKind: "user", message });
  });
}

/** The flow, with its row locked so two changes cannot both become version n+1. */
async function lockFlow(tx: AppTransaction, flowId: string) {
  await tx.execute(sql`select 1 from ${flows} where ${flows.id} = ${flowId} for update`);
  return readFlow(tx, flowId);
}

async function writeVersion(
  tx: AppTransaction,
  ctx: OrgContext,
  flow: { id: string; version: { number: number } },
  document: FlowDocument,
  patch: Patch,
  options: { actorKind: ActorKind; message: string },
): Promise<CommitResult> {
  const number = flow.version.number + 1;
  const [version] = await tx
    .insert(flowVersions)
    .values({
      orgId: ctx.orgId,
      flowId: flow.id,
      number,
      document,
      patch,
      actorKind: options.actorKind,
      message: options.message,
      createdBy: ctx.userId,
    })
    .returning({ id: flowVersions.id });
  await tx
    .update(flows)
    .set({
      currentVersionId: version!.id,
      name: document.name,
      description: document.description,
      updatedAt: new Date(),
    })
    .where(eq(flows.id, flow.id));
  return { ok: true, versionId: version!.id, number, document };
}
