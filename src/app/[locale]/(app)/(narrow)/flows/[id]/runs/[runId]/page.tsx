import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/core/auth/guard";
import { RunView, type RunJson } from "@/components/run/run-view";
import { getRun } from "@/modules/runs/service";

/** One run, step by step. The id is looked up inside the workspace. */
async function load(runId: string): Promise<RunJson | null> {
  const ctx = await requireOrgContext();
  if (!ctx || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return null;
  const run = await getRun(ctx, runId);
  return run ? (JSON.parse(JSON.stringify(run)) as RunJson) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("run.view");
  return { title: t("metaTitle") };
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const run = await load(runId);
  if (!run || run.flowId !== id) notFound();
  return <RunView initial={run} />;
}
