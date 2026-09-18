"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { formatStamp } from "@/core/dates";
import { cancelRunAction } from "@/modules/runs/actions";
import type { RunView as RunRecord } from "@/modules/runs/service";
import { Link } from "@/i18n/navigation";
import { ExplainFailure } from "./explain-failure";
import { OutputView } from "./output-view";
import { StepList } from "./step-list";

/**
 * One run, watched (CLAUDE.md: never a black box). While it is queued
 * or running the page asks every two seconds and shows each step as
 * it lands; when it is over, the outputs, the totals and — if it
 * failed — which brick, with what in hand.
 */

/** The run as JSON: dates are strings on the wire. */
export type RunJson = Omit<RunRecord, "startedAt" | "finishedAt" | "createdAt" | "steps"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  steps: Array<
    Omit<RunRecord["steps"][number], "startedAt" | "finishedAt"> & {
      startedAt: string;
      finishedAt: string | null;
    }
  >;
};

const LIVE = new Set(["queued", "running"]);

export function RunView({ initial, withAi }: { initial: RunJson; withAi: boolean }) {
  const t = useTranslations("run.view");
  const locale = useLocale();
  const [run, setRun] = useState(initial);
  const live = LIVE.has(run.status);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; run?: RunJson };
        if (alive && data.ok && data.run) setRun(data.run);
      } catch {
        // The next tick asks again.
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [live, run.id]);

  const duration =
    run.startedAt && run.finishedAt
      ? Math.max(1, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker={
          <Link href={`/flows/${run.flowId}`} className="hover:underline">
            {run.flowName}
          </Link>
        }
        title={t("title", { mode: run.mode })}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusPill status={run.status} />
            <span>{formatStamp(new Date(run.createdAt), locale)}</span>
            {duration !== null ? <span>{t("duration", { seconds: duration })}</span> : null}
            {run.engine ? <span>{run.engine}</span> : null}
            {run.tokensIn + run.tokensOut > 0 ? (
              <span>{t("tokens", { in: run.tokensIn, out: run.tokensOut })}</span>
            ) : null}
          </span>
        }
        size="detail"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/flows/${run.flowId}/runs`} />}
            >
              {t("history")}
            </Button>
            {live ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const result = await cancelRunAction({ runId: run.id });
                  if (!result.ok) toast.error(t("cancelFailed"));
                }}
              >
                {t("cancel")}
              </Button>
            ) : null}
          </>
        }
      />

      {run.error ? (
        <div className="flex flex-col gap-3">
          <div className="bg-warning-tint text-warning rounded-md px-4 py-3 text-sm">
            <p className="font-semibold">{t("failedTitle")}</p>
            <p className="mt-1 whitespace-pre-wrap">{run.error}</p>
          </div>
          {withAi && run.status === "failed" ? (
            <ExplainFailure runId={run.id} flowId={run.flowId} />
          ) : null}
        </div>
      ) : null}

      {run.status === "done" ? <OutputView run={run} /> : null}

      <StepList run={run} />
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const ts = useTranslations("run.status");
  const tone =
    status === "done"
      ? "bg-success-tint text-success"
      : status === "failed"
        ? "bg-warning-tint text-warning"
        : status === "running"
          ? "bg-accent text-accent-foreground"
          : "bg-secondary text-secondary-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-2sm font-medium ${tone}`}>
      {ts(status as "queued")}
    </span>
  );
}
