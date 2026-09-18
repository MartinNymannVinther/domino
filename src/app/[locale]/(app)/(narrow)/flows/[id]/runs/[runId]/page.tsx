import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/core/auth/guard";
import { RunView, type RunJson } from "@/components/run/run-view";
import { modelConfigured } from "@/modules/ai/service";
import { getRun } from "@/modules/runs/service";

/** One run, step by step. The id is looked up inside the workspace. */
async function load(runId: string): Promise<{ run: RunJson; withAi: boolean } | null> {
  const ctx = await requireOrgContext();
  if (!ctx || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return null;
  const run = await getRun(ctx, runId);
  if (!run) return null;
  return { run: JSON.parse(JSON.stringify(run)) as RunJson, withAi: await modelConfigured(ctx) };
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
  const loaded = await load(runId);
  if (!loaded || loaded.run.flowId !== id) notFound();
  return <RunView initial={loaded.run} withAi={loaded.withAi} />;
}
