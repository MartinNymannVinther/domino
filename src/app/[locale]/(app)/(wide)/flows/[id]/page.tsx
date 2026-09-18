import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/core/auth/guard";
import { FlowEditor } from "@/components/flow/flow-editor";
import { getFlow } from "@/modules/flow/service";

/**
 * One flow on the canvas. The id is looked up inside the caller's
 * workspace; a flow that is not theirs, or does not exist, is the same
 * 404 (CLAUDE.md, security rules).
 */
async function load(id: string) {
  const ctx = await requireOrgContext();
  if (!ctx || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return getFlow(ctx, id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const flow = await load((await params).id);
  return { title: flow?.name ?? "Domino" };
}

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await load(id);
  if (!flow) notFound();
  return (
    <FlowEditor
      flowId={flow.id}
      initial={{
        document: flow.document,
        version: { id: flow.version.id, number: flow.version.number },
      }}
    />
  );
}
