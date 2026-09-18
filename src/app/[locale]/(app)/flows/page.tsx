import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("flows");
  return { title: t("title") };
}

/**
 * The flows the workspace has. The list, the canvas and the start screen
 * arrive with the product's own waves (CLAUDE.md, roadmap); until then
 * this is the door, standing where the door will be.
 */
export default async function FlowsPage() {
  const t = await getTranslations("flows");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <EmptyState title={t("empty.title")} hint={t("empty.hint")} />
    </div>
  );
}
