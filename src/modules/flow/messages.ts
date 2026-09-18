import { asc, eq, sql } from "drizzle-orm";
import { flowMessages, type ProposalStatus } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { Patch } from "./patch";
import { commitPatch, type CommitResult } from "./versions";

/**
 * The conversation about a flow (docs/adr/0011): a person's line as
 * written, the model's reply with its proposal — a patch against the
 * version it was written for — until the person accepts it (a version
 * is made and named on the message) or turns it down.
 */

export type Proposal = { baseVersionId: string; patch: Patch };

export type FlowMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  engine: string;
  proposal: Proposal | null;
  proposalStatus: ProposalStatus | null;
  resultVersionId: string | null;
  createdAt: Date;
};

export async function listMessages(ctx: OrgContext, flowId: string): Promise<FlowMessage[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(flowMessages)
      .where(eq(flowMessages.flowId, flowId))
      .orderBy(asc(flowMessages.createdAt));
    return rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      engine: r.engine,
      proposal: readProposal(r.proposal),
      proposalStatus: (r.proposalStatus as ProposalStatus | null) ?? null,
      resultVersionId: r.resultVersionId,
      createdAt: r.createdAt,
    }));
  });
}

function readProposal(raw: unknown): Proposal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as { baseVersionId?: unknown; patch?: unknown };
  const patch = Patch.safeParse(record.patch);
  if (!patch.success || typeof record.baseVersionId !== "string") return null;
  return { baseVersionId: record.baseVersionId, patch: patch.data };
}

/** One exchange: the person's line and the model's answer, with or without a proposal. */
export async function recordExchange(
  ctx: OrgContext,
  flowId: string,
  exchange: { user: string; assistant: string; engine: string; proposal: Proposal | null },
): Promise<{ assistantId: string }> {
  return withOrgContext(ctx, async (tx) => {
    await tx.insert(flowMessages).values({
      orgId: ctx.orgId,
      flowId,
      role: "user",
      content: exchange.user,
      userId: ctx.userId,
    });
    const [assistant] = await tx
      .insert(flowMessages)
      .values({
        orgId: ctx.orgId,
        flowId,
        role: "assistant",
        content: exchange.assistant,
        engine: exchange.engine,
        proposal: exchange.proposal,
        proposalStatus: exchange.proposal ? "proposed" : null,
        userId: ctx.userId,
      })
      .returning({ id: flowMessages.id });
    return { assistantId: assistant!.id };
  });
}

/**
 * The person says yes: the proposal is applied through the same door
 * as their own edits, marked as the model's hand, and the message
 * remembers which version it became. A proposal written for a version
 * that is no longer current is refused as a conflict, like any patch.
 */
export async function acceptProposal(
  ctx: OrgContext,
  flowId: string,
  messageId: string,
): Promise<CommitResult> {
  const message = await findProposed(ctx, flowId, messageId);
  if (!message?.proposal) return { ok: false, error: "notFound" };
  const result = await commitPatch(ctx, flowId, message.proposal.patch, {
    actorKind: "ai",
    message: message.content.slice(0, 200),
    baseVersionId: message.proposal.baseVersionId,
  });
  if (!result.ok) return result;
  await setStatus(ctx, messageId, "accepted", result.versionId);
  return result;
}

export async function rejectProposal(
  ctx: OrgContext,
  flowId: string,
  messageId: string,
): Promise<boolean> {
  const message = await findProposed(ctx, flowId, messageId);
  if (!message?.proposal) return false;
  await setStatus(ctx, messageId, "rejected", null);
  return true;
}

async function findProposed(ctx: OrgContext, flowId: string, messageId: string) {
  const messages = await listMessages(ctx, flowId);
  return messages.find((m) => m.id === messageId && m.proposalStatus === "proposed") ?? null;
}

async function setStatus(
  ctx: OrgContext,
  messageId: string,
  status: ProposalStatus,
  resultVersionId: string | null,
) {
  await withOrgContext(ctx, (tx) =>
    tx
      .update(flowMessages)
      .set({ proposalStatus: status, resultVersionId })
      .where(sql`${flowMessages.id} = ${messageId}`),
  );
}
