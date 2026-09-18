"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatStamp } from "@/core/dates";
import { listVersionsAction } from "@/modules/flow/actions";
import type { VersionSummary } from "@/modules/flow/versions";
import { cn } from "@/lib/utils";

/**
 * Every version of the flow, newest first: who made it, what it says,
 * and a way back to any of them. Going back is a new version (docs/adr/
 * 0011), so the list only ever grows and nothing is lost by looking.
 */
export function HistorySheet({
  flowId,
  currentNumber,
  onRevert,
}: {
  flowId: string;
  currentNumber: number;
  onRevert: (versionId: string, number: number) => Promise<boolean>;
}) {
  const t = useTranslations("flow.history");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);

  const load = () => {
    setVersions(null);
    listVersionsAction({ flowId }).then((result) => {
      if (result.ok) setVersions([...result.data].reverse());
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            {t("button", { number: currentNumber })}
          </Button>
        }
      />
      <SheetContent side="right" className="w-96">
        <div className="flex flex-col gap-4 px-5 py-5">
          <SheetTitle className="text-base font-semibold">{t("title")}</SheetTitle>
          {versions === null ? (
            <p className="text-meta text-2sm">{t("loading")}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className={cn(
                    "border-border flex flex-col gap-1 rounded-md border px-3 py-2",
                    v.number === currentNumber && "bg-secondary",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {t("version", { number: v.number })}
                    </span>
                    <span className="text-meta text-xs">
                      {formatStamp(new Date(v.createdAt), locale)}
                    </span>
                  </div>
                  <p className="text-2sm">
                    {v.message || t("noMessage")}
                    <span className="text-meta"> · {t(`actor.${v.actorKind}`)}</span>
                    {v.patch ? (
                      <span className="text-meta">
                        {" "}
                        · {t("ops", { count: v.patch.ops.length })}
                      </span>
                    ) : null}
                  </p>
                  {v.number !== currentNumber ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="w-fit"
                      onClick={async () => {
                        if (await onRevert(v.id, v.number)) setOpen(false);
                      }}
                    >
                      {t("revert")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
