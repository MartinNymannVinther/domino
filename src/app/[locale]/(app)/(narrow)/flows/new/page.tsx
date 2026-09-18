import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/core/auth/guard";
import { StartScreen } from "@/components/flow/start-screen";
import { PageHeader } from "@/components/ui/page-header";
import { modelConfigured } from "@/modules/ai/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("flows.start");
  return { title: t("title") };
}

/** Talking a flow into existence: the start screen (CLAUDE.md). */
export default async function NewFlowPage() {
  const t = await getTranslations("flows.start");
  const ctx = await requireOrgContext();
  const hasModel = ctx ? await modelConfigured(ctx) : false;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <StartScreen modelConfigured={hasModel} />
    </div>
  );
}
