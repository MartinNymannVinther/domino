import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatStamp } from "@/core/dates";
import { env } from "@/core/env";
import { buildInfo } from "@/core/version";
import { getSchemaState } from "./schema-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.about");
  return { title: t("title") };
}

/**
 * What is actually running here. One page to answer "which version do I
 * have" without asking anyone, and to show the two things that make that
 * answer trustworthy: when it was built, and whether the database has kept
 * up with it.
 */
export default async function AboutPage() {
  const t = await getTranslations("app.about");
  const locale = await getLocale();
  const schema = await getSchemaState();

  // Both stamps on this page go through `formatStamp` like every other
  // moment in the product. Handing the next-intl locale straight to
  // `Intl` is what made "en" mean en-US here: this page alone printed
  // "September 16, 2026 at 12:28 PM" while the rest of the English UI
  // was day-first. A stamp that cannot be read is written as unknown
  // rather than thrown, because a build stamp must not take the page
  // down with it.
  const format = (value: string | null) => {
    const at = value ? new Date(value) : null;
    return at && !Number.isNaN(at.valueOf()) ? formatStamp(at, locale) : t("unknown");
  };

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t("versionLabel"), value: buildInfo.version, mono: true },
    { label: t("commitLabel"), value: buildInfo.commit, mono: true },
    { label: t("builtAtLabel"), value: format(buildInfo.builtAt || null) },
    { label: t("environmentLabel"), value: t(`environments.${env.NODE_ENV}`) },
    { label: t("runtimeLabel"), value: `Node ${process.version.replace(/^v/, "")}`, mono: true },
  ];

  const schemaRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t("migrationLabel"), value: buildInfo.migration, mono: true },
    {
      label: t("appliedLabel"),
      value:
        schema.applied === null
          ? t("unknown")
          : t("appliedValue", { applied: schema.applied, expected: schema.expected }),
    },
    { label: t("appliedAtLabel"), value: format(schema.appliedAt) },
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-reading tracking-tight">{buildInfo.release}</span>
            {buildInfo.dirty ? <Badge variant="destructive">{t("dirty")}</Badge> : null}
          </CardTitle>
          <CardDescription>{buildInfo.dirty ? t("dirtyHint") : t("releaseHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList rows={rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("schemaTitle")}
            {schema.behind ? <Badge variant="destructive">{t("schemaBehind")}</Badge> : null}
          </CardTitle>
          <CardDescription>
            {schema.behind ? t("schemaBehindHint") : t("schemaHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList rows={schemaRows} />
        </CardContent>
      </Card>

      <p className="text-meta text-2sm leading-relaxed">{t("license")}</p>
    </div>
  );
}

function DetailList({ rows }: { rows: Array<{ label: string; value: string; mono?: boolean }> }) {
  return (
    <dl className="divide-border divide-y text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5 first:pt-0 last:pb-0"
        >
          <dt className="text-meta text-2sm">{row.label}</dt>
          <dd className={row.mono ? "font-mono text-2sm" : "text-2sm"}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
