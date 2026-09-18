"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { FileRef, FlowDocument, FlowNodeOf } from "@/modules/flow";
import { startRunAction } from "@/modules/runs/actions";
import { useRouter } from "@/i18n/navigation";
import { FileField } from "./file-field";

/**
 * Starting a run: one field per input brick — text, a file, a pile —
 * then one example first or the whole pile (CLAUDE.md, never a black
 * box). The input is validated again on the server against the flow's
 * bricks; this only makes it easy to give.
 */
type Given = string | FileRef | FileRef[] | string[] | undefined;

export function RunSheet({
  flowId,
  document,
  ready,
}: {
  flowId: string;
  document: FlowDocument;
  ready: boolean;
}) {
  const t = useTranslations("run.start");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [given, setGiven] = useState<Record<string, Given>>({});
  const [pending, startTransition] = useTransition();
  const inputs = document.nodes.filter((n): n is FlowNodeOf<"input"> => n.type === "input");
  const hasPile = inputs.some((n) => n.config.kind === "list");

  const start = (mode: "test" | "full") =>
    startTransition(async () => {
      const result = await startRunAction({ flowId, mode, input: given });
      if (!result.ok) {
        toast.error(t(`failed.${result.reason ?? "generic"}`));
        return;
      }
      setOpen(false);
      router.push(`/flows/${flowId}/runs/${result.data.runId}`);
    });

  const complete = inputs.every((n) => {
    const value = given[n.id];
    if (n.config.kind === "text") return typeof value === "string" && value.trim() !== "";
    if (n.config.kind === "file")
      return typeof value === "object" && value !== null && !Array.isArray(value);
    return Array.isArray(value) && value.length > 0;
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            size="sm"
            disabled={!ready}
            title={ready ? undefined : t("notReady")}
          >
            <PlayIcon data-icon="inline-start" />
            {t("button")}
          </Button>
        }
      />
      <SheetContent side="right" className="w-[28rem]">
        <form
          className="flex h-full flex-col gap-5 overflow-y-auto px-5 py-5"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-1">
            <SheetTitle className="text-base font-semibold">{t("title")}</SheetTitle>
            <p className="text-meta text-2sm">{t("subtitle")}</p>
          </div>
          {inputs.length === 0 ? <p className="text-meta text-2sm">{t("noInputs")}</p> : null}
          {inputs.map((node) => (
            <div key={node.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`in-${node.id}`}>{node.config.label}</Label>
              {node.config.hint ? <p className="text-meta text-2sm">{node.config.hint}</p> : null}
              {node.config.kind === "text" ? (
                <Textarea
                  id={`in-${node.id}`}
                  rows={6}
                  value={typeof given[node.id] === "string" ? (given[node.id] as string) : ""}
                  onChange={(e) => setGiven({ ...given, [node.id]: e.target.value })}
                />
              ) : node.config.kind === "list" && node.config.itemKind === "text" ? (
                <>
                  <Textarea
                    id={`in-${node.id}`}
                    rows={6}
                    placeholder={t("linesPlaceholder")}
                    onChange={(e) =>
                      setGiven({
                        ...given,
                        [node.id]: e.target.value
                          .split(/\n\s*\n/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <p className="text-meta text-xs">{t("linesHelp")}</p>
                </>
              ) : (
                <FileField
                  id={`in-${node.id}`}
                  flowId={flowId}
                  multiple={node.config.kind === "list"}
                  value={
                    Array.isArray(given[node.id])
                      ? (given[node.id] as FileRef[])
                      : given[node.id] && typeof given[node.id] === "object"
                        ? [given[node.id] as FileRef]
                        : []
                  }
                  onChange={(refs) =>
                    setGiven({ ...given, [node.id]: node.config.kind === "list" ? refs : refs[0] })
                  }
                />
              )}
            </div>
          ))}
          <div className="mt-auto flex flex-col gap-2 pt-2">
            {hasPile ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending || !complete}
                onClick={() => start("test")}
              >
                {t("test")}
              </Button>
            ) : null}
            <Button type="button" disabled={pending || !complete} onClick={() => start("full")}>
              {hasPile ? t("full") : t("run")}
            </Button>
            <p className="text-meta text-xs">{t("hint")}</p>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
