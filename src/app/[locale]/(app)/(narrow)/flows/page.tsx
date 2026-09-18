import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/core/auth/guard";
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
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listFlows } from "@/modules/flow/service";
import { lastRuns } from "@/modules/runs/service";
import { StatusPill } from "@/components/run/run-view";
import { ImportFlowButton } from "./import-flow-button";
import { NewFlowMenu } from "./new-flow-menu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("flows");
  return { title: t("title") };
}

/**
 * The flows the workspace has, newest change first, with the ways in:
 * start from an example or from nothing, or bring a file back in
 * (dogma three). The start screen that talks a flow into existence
 * arrives with wave three and sits on top of this list.
 */
export default async function FlowsPage() {
  const t = await getTranslations("flows");
  const locale = await getLocale();
  const ctx = await requireOrgContext();
  const flows = ctx ? await listFlows(ctx) : [];
  const runs = ctx ? await lastRuns(ctx) : new Map();
  const actions = (
    <>
      <ImportFlowButton />
      <NewFlowMenu />
      <Button size="sm" nativeButton={false} render={<Link href="/flows/new" />}>
        {t("describe")}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={actions} />
      {flows.length === 0 ? (
        <EmptyState
          title={t("empty.title")}
          hint={t("empty.hint")}
          action={
            <Button size="sm" nativeButton={false} render={<Link href="/flows/new" />}>
              {t("describe")}
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("columns.description")}</TableHead>
              <TableHead>{t("columns.lastRun")}</TableHead>
              <TableHead className="text-right">{t("columns.version")}</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                {t("columns.updated")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.map((flow) => (
              <LinkedRow key={flow.id} href={`/flows/${flow.id}`}>
                <TableCell className="font-medium">
                  <Link href={`/flows/${flow.id}`} className="hover:underline">
                    {flow.name}
                  </Link>
                </TableCell>
                <TableCell className="text-meta hidden max-w-md truncate sm:table-cell">
                  {flow.description}
                </TableCell>
                <TableCell>
                  {runs.get(flow.id) ? (
                    <Link href={`/flows/${flow.id}/runs/${runs.get(flow.id)!.id}`}>
                      <StatusPill status={runs.get(flow.id)!.status} />
                    </Link>
                  ) : (
                    <span className="text-meta">–</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{flow.versionNumber}</TableCell>
                <TableCell className="text-meta hidden text-right md:table-cell">
                  {formatStamp(flow.updatedAt, locale)}
                </TableCell>
              </LinkedRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
