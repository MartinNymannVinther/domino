"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Explanation } from "@/modules/ai/brick-assist";
import { askAi } from "@/modules/ai/read-client";
import { acceptFixAction } from "@/modules/flow/actions-chat";
import type { Patch } from "@/modules/flow";
import { Link } from "@/i18n/navigation";

/**
 * A failed run explained in plain words, with a fix to accept (CLAUDE.md,
 * product principles). The explanation is a read; the fix becomes a
 * version of the flow only when the person presses the button, marked
 * as the model's hand, and the flow page is one link away to see it.
 */
type Fix = { flowId: string; baseVersionId: string; patch: Patch };

export function ExplainFailure({ runId, flowId }: { runId: string; flowId: string }) {
  const t = useTranslations("run.explain");
  const locale = useLocale();
  const [asking, setAsking] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  const ask = async () => {
    setAsking(true);
    const result = await askAi<Explanation & { baseVersionId: string; flowId: string }>(
      "explain-run",
      { runId },
      { locale },
    );
    setAsking(false);
    if (!result.ok) {
      toast.error(t(`failed.${result.error}` as "failed.generic"));
      return;
    }
    if (!result.proposal.ok) {
      toast.error(t("failed.badAnswer"));
      return;
    }
    setExplanation(result.proposal.explanation);
    setFix(
      result.proposal.patch
        ? {
            flowId: result.proposal.flowId,
            baseVersionId: result.proposal.baseVersionId,
            patch: result.proposal.patch,
          }
        : null,
    );
  };

  const apply = async () => {
    if (!fix) return;
    const result = await acceptFixAction({ ...fix, message: t("fixMessage") });
    if (!result.ok) {
      toast.error(result.error === "conflict" ? t("conflict") : t("failed.generic"));
      return;
    }
    setApplied(result.data.number);
    setFix(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {explanation === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={asking}
          onClick={ask}
        >
          <SparklesIcon data-icon="inline-start" />
          {asking ? t("asking") : t("button")}
        </Button>
      ) : (
        <div className="border-border bg-card flex flex-col gap-3 rounded-md border px-4 py-3">
          <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">
            {t("title")}
          </p>
          <p className="text-reading leading-relaxed whitespace-pre-wrap">{explanation}</p>
          {fix ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={apply}>
                {t("applyFix", { count: fix.patch.ops.length })}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFix(null)}>
                {t("dismiss")}
              </Button>
            </div>
          ) : null}
          {applied !== null ? (
            <p className="text-success text-2sm">
              {t("applied", { number: applied })}{" "}
              <Link href={`/flows/${flowId}`} className="underline">
                {t("openFlow")}
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
