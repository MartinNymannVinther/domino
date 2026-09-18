import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/core/auth/guard";
import { FlowEditor } from "@/components/flow/flow-editor";
import { modelConfigured } from "@/modules/ai/service";
import { listMessages } from "@/modules/flow/messages";
import { getFlow } from "@/modules/flow/service";

/**
 * One flow on the canvas. The id is looked up inside the caller's
 * workspace; a flow that is not theirs, or does not exist, is the same
 * 404 (CLAUDE.md, security rules).
 */
async function load(id: string) {
  const ctx = await requireOrgContext();
  if (!ctx || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const flow = await getFlow(ctx, id);
  if (!flow) return null;
  const [messages, hasModel] = await Promise.all([listMessages(ctx, id), modelConfigured(ctx)]);
  return { flow, messages, hasModel };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const loaded = await load((await params).id);
  return { title: loaded?.flow.name ?? "Domino" };
}

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await load(id);
  if (!loaded) notFound();
  const { flow, messages, hasModel } = loaded;
  return (
    <FlowEditor
      flowId={flow.id}
      modelConfigured={hasModel}
      initial={{
        document: flow.document,
        version: { id: flow.version.id, number: flow.version.number },
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          proposal: m.proposal,
          proposalStatus: m.proposalStatus,
        })),
      }}
    />
  );
}
