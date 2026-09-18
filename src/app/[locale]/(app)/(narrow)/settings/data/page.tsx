import { FileJson, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPORT_TABLES } from "@/modules/export/tables";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dataExport");
  return { title: t("title") };
}

/**
 * Taking your data out.
 *
 * Two formats because they answer different questions: the spreadsheet is
 * what you send an accountant, the JSON is what you hand another system the
 * day you want to leave. The page says plainly that neither is a backup,
 * because the failure mode of believing otherwise is losing everything
 * while feeling covered.
 */
export default async function DataExportPage() {
  const t = await getTranslations("app.dataExport");
  const sheets = EXPORT_TABLES.map((table) => table.sheet).join(", ");

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("xlsxTitle")}</CardTitle>
          <CardDescription>{t("xlsxBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <a href="/api/export" className={cn(buttonVariants({ size: "sm" }), "w-fit")} download>
            <FileSpreadsheet data-slot="icon" />
            {t("xlsxAction")}
          </a>
          <p className="text-meta text-2sm leading-relaxed">
            {t("sheetsLabel")} {t("membersSheet")}, {sheets}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("jsonTitle")}</CardTitle>
          <CardDescription>{t("jsonBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/export?format=json"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit")}
            download
          >
            <FileJson data-slot="icon" />
            {t("jsonAction")}
          </a>
        </CardContent>
      </Card>

      <div className="border-border bg-warning-tint rounded-lg border p-4">
        <p className="text-2sm leading-relaxed">
          <strong className="font-semibold">{t("notBackupTitle")}</strong> {t("notBackupBody")}
        </p>
      </div>

      <p className="text-meta text-2sm leading-relaxed">{t("privacy")}</p>
    </div>
  );
}
