"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toText } from "@/modules/engine";
import { cn } from "@/lib/utils";
import { StatusPill, type RunJson } from "./run-view";

/**
 * The steps, in the order they happened, with what went in and what
 * came out of every one (docs/adr/0011: the steps are the record). A
 * step inside a loop says which time round; a failed one says why.
 */
export function StepList({ run }: { run: RunJson }) {
  const t = useTranslations("run.steps");
  const tb = useTranslations("bricks");
  const titles = new Map(run.document.nodes.map((n) => [n.id, n]));
  // A brick that went round more than once says which time; the rest say nothing.
  const looped = new Set(run.steps.filter((s) => s.iteration > 0).map((s) => s.nodeId));
  if (run.steps.length === 0) return <p className="text-meta text-2sm">{t("none")}</p>;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{t("title", { count: run.steps.length })}</h2>
      <ol className="flex flex-col gap-1.5">
        {run.steps.map((step) => {
          const node = titles.get(step.nodeId);
          return (
            <Step
              key={step.id}
              step={step}
              title={node?.title ?? step.nodeId}
              kind={node ? tb(`types.${node.type}`) : ""}
              inLoop={looped.has(step.nodeId)}
            />
          );
        })}
      </ol>
    </section>
  );
}

function Step({
  step,
  title,
  kind,
  inLoop,
}: {
  step: RunJson["steps"][number];
  title: string;
  kind: string;
  inLoop: boolean;
}) {
  const t = useTranslations("run.steps");
  const [open, setOpen] = useState(step.status === "failed");
  const ms = step.finishedAt ? Date.parse(step.finishedAt) - Date.parse(step.startedAt) : null;
  return (
    <li className="border-border bg-card rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <StatusPill status={step.status} />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{title}</span>
          <span className="text-meta"> · {kind}</span>
          {inLoop ? (
            <span className="text-meta"> · {t("iteration", { n: step.iteration + 1 })}</span>
          ) : null}
        </span>
        {ms !== null ? (
          <span className="text-meta text-xs tabular-nums">{t("ms", { ms })}</span>
        ) : null}
        {step.reused ? <span className="text-meta text-xs">{t("reused")}</span> : null}
        {step.tokensIn + step.tokensOut > 0 ? (
          <span className="text-meta text-xs tabular-nums">
            {t("tokens", { in: step.tokensIn, out: step.tokensOut })}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-border grid gap-3 border-t px-3 py-3 md:grid-cols-2">
          <Values label={t("input")} value={step.input} />
          <Values
            label={step.error ? t("error") : t("output")}
            value={step.error ?? step.output}
            warn={Boolean(step.error)}
          />
        </div>
      ) : null}
    </li>
  );
}

function Values({ label, value, warn }: { label: string; value: unknown; warn?: boolean }) {
  const t = useTranslations("run.steps");
  const entries =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : value === null || value === undefined
        ? []
        : [["", value] as const];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">{label}</p>
      {entries.length === 0 ? <p className="text-meta text-2sm">{t("empty")}</p> : null}
      {entries.map(([port, v]) => (
        <div key={port} className="flex min-w-0 flex-col gap-0.5">
          {port ? <p className="text-meta text-xs">{port}</p> : null}
          <pre
            className={cn(
              "bg-background max-h-72 overflow-auto rounded-md px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap",
              warn && "text-warning",
            )}
          >
            {typeof v === "string" ? v : toText(v as never)}
          </pre>
        </div>
      ))}
    </div>
  );
}
