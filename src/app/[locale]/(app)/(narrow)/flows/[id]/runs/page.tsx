import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/core/auth/guard";
import { StatusPill } from "@/components/run/run-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkedRow } from "@/components/ui/linked-row";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatStamp } from "@/core/dates";
import { Link } from "@/i18n/navigation";
import { getFlow } from "@/modules/flow/service";
import { listRuns } from "@/modules/runs/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("run.list");
  return { title: t("title") };
}

/** The history of a flow's runs: status, when, how long, what it cost. */
export default async function RunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  if (!ctx || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const flow = await getFlow(ctx, id);
  if (!flow) notFound();
  const t = await getTranslations("run.list");
  const tm = await getTranslations("run.mode");
  const locale = await getLocale();
  const runs = await listRuns(ctx, id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker={
          <Link href={`/flows/${id}`} className="hover:underline">
            {flow.name}
          </Link>
        }
        title={t("title")}
        subtitle={t("subtitle")}
        size="detail"
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/flows/${id}`} />}
          >
            {t("toCanvas")}
          </Button>
        }
      />
      {runs.length === 0 ? (
        <EmptyState title={t("empty.title")} hint={t("empty.hint")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.mode")}</TableHead>
              <TableHead>{t("columns.started")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                {t("columns.steps")}
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                {t("columns.tokens")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.engine")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <LinkedRow key={run.id} href={`/flows/${id}/runs/${run.id}`}>
                <TableCell>
                  <Link href={`/flows/${id}/runs/${run.id}`}>
                    <StatusPill status={run.status} />
                  </Link>
                </TableCell>
                <TableCell>{tm(run.mode)}</TableCell>
                <TableCell className="text-meta">{formatStamp(run.createdAt, locale)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {run.stepCount}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {run.tokensIn + run.tokensOut}
                </TableCell>
                <TableCell className="text-meta hidden lg:table-cell">{run.engine}</TableCell>
              </LinkedRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
