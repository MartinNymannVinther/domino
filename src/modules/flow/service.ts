import { and, desc, eq, isNull } from "drizzle-orm";
import { flows, flowVersions, type ActorKind } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { exportDocument, importDocument, type ImportResult } from "./io";
import type { FlowDocument } from "./schema";
import { parseDocument } from "./validate";

/**
 * Flows in the database: made, listed, read, taken out again (dogma
 * three) and removed. Every query runs inside the caller's workspace
 * context, so RLS decides what exists; an id from another workspace is
 * simply not found. Changes to a flow go through versions.ts.
 */

export type FlowSummary = {
  id: string;
  name: string;
  description: string;
  versionNumber: number;
  updatedAt: Date;
  createdAt: Date;
};

export type FlowView = {
  id: string;
  name: string;
  description: string;
  document: FlowDocument;
  version: { id: string; number: number; actorKind: ActorKind; message: string; createdAt: Date };
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listFlows(ctx: OrgContext): Promise<FlowSummary[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: flows.id,
        name: flows.name,
        description: flows.description,
        versionNumber: flowVersions.number,
        updatedAt: flows.updatedAt,
        createdAt: flows.createdAt,
      })
      .from(flows)
      .leftJoin(flowVersions, eq(flowVersions.id, flows.currentVersionId))
      .where(isNull(flows.archivedAt))
      .orderBy(desc(flows.updatedAt));
    return rows.map((r) => ({ ...r, versionNumber: r.versionNumber ?? 0 }));
  });
}

/** The flow and the version the canvas shows; null when it is not this workspace's. */
export async function getFlow(ctx: OrgContext, flowId: string): Promise<FlowView | null> {
  return withOrgContext(ctx, (tx) => readFlow(tx, flowId));
}

export async function readFlow(tx: AppTransaction, flowId: string): Promise<FlowView | null> {
  const [row] = await tx
    .select({ flow: flows, version: flowVersions })
    .from(flows)
    .innerJoin(flowVersions, eq(flowVersions.id, flows.currentVersionId))
    .where(eq(flows.id, flowId))
    .limit(1);
  if (!row) return null;
  // Stored documents were validated on the way in; one that no longer
  // parses is a format that moved on without a migration, and that is a
  // bug worth a loud failure rather than a blank canvas.
  const parsed = parseDocument(row.version.document);
  if (!parsed.ok) throw new Error(`flow ${flowId} holds a document that does not validate`);
  return {
    id: row.flow.id,
    name: row.flow.name,
    description: row.flow.description,
    document: parsed.document,
    version: {
      id: row.version.id,
      number: row.version.number,
      actorKind: row.version.actorKind as ActorKind,
      message: row.version.message,
      createdAt: row.version.createdAt,
    },
    archivedAt: row.flow.archivedAt,
    createdAt: row.flow.createdAt,
    updatedAt: row.flow.updatedAt,
  };
}

/**
 * A new flow from a validated document, as version 1. The document is
 * parsed once more here rather than trusted: this is the write boundary
 * (CLAUDE.md, security rules), and every caller — the start screen, an
 * import, the demo seed — goes through it.
 */
export async function createFlow(
  ctx: OrgContext,
  raw: unknown,
  options: { actorKind?: ActorKind; message?: string } = {},
): Promise<{ ok: true; flowId: string; versionId: string } | { ok: false; problems: string[] }> {
  const parsed = parseDocument(raw);
  if (!parsed.ok) return { ok: false, problems: parsed.problems.map((p) => p.message) };
  const document = parsed.document;
  return withOrgContext(ctx, async (tx) => {
    const [flow] = await tx
      .insert(flows)
      .values({
        orgId: ctx.orgId,
        name: document.name,
        description: document.description,
        createdBy: ctx.userId,
      })
      .returning({ id: flows.id });
    const [version] = await tx
      .insert(flowVersions)
      .values({
        orgId: ctx.orgId,
        flowId: flow!.id,
        number: 1,
        document,
        patch: null,
        actorKind: options.actorKind ?? "user",
        message: options.message ?? "",
        createdBy: ctx.userId,
      })
      .returning({ id: flowVersions.id });
    await tx.update(flows).set({ currentVersionId: version!.id }).where(eq(flows.id, flow!.id));
    return { ok: true, flowId: flow!.id, versionId: version!.id };
  });
}

/** A file in: read, migrated, validated, stored as a new flow (dogma three). */
export async function importFlow(
  ctx: OrgContext,
  text: string,
): Promise<
  { ok: true; flowId: string; migratedFrom: number | null } | { ok: false; result: ImportResult }
> {
  const result = importDocument(text);
  if (!result.ok) return { ok: false, result };
  const created = await createFlow(ctx, result.document, { message: "import" });
  if (!created.ok) return { ok: false, result: { ok: false, reason: "invalid" } };
  return { ok: true, flowId: created.flowId, migratedFrom: result.migratedFrom };
}

/** The current document as a file; null when the flow is not this workspace's. */
export async function exportFlow(
  ctx: OrgContext,
  flowId: string,
): Promise<{ name: string; text: string } | null> {
  const flow = await getFlow(ctx, flowId);
  return flow ? { name: flow.name, text: exportDocument(flow.document) } : null;
}

export async function archiveFlow(
  ctx: OrgContext,
  flowId: string,
  archived: boolean,
): Promise<boolean> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .update(flows)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(flows.id, flowId))
      .returning({ id: flows.id });
    return rows.length > 0;
  });
}

/** Gone for good: versions, messages, files and runs go with it through the cascade. */
export async function deleteFlow(ctx: OrgContext, flowId: string): Promise<boolean> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .delete(flows)
      .where(and(eq(flows.id, flowId), eq(flows.orgId, ctx.orgId)))
      .returning({ id: flows.id });
    return rows.length > 0;
  });
}
