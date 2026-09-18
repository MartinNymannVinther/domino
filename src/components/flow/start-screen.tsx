"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { FlowCanvas } from "@/components/canvas/flow-canvas";
import type { Mark } from "@/components/canvas/graph";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askAi } from "@/modules/ai/read-client";
import type { FlowProposal } from "@/modules/ai/propose-flow";
import { MAX_DESCRIPTION_CHARS, type AiFailure } from "@/modules/ai/wire";
import { EXAMPLE_FLOWS, validateDocument, type FlowDocument } from "@/modules/flow";
import { createFlowAction } from "@/modules/flow/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * The first screen is not an empty canvas (CLAUDE.md, product
 * principles): a field to say what you want, beside the examples to
 * start from. The model's proposal lands here as a whole flow to look
 * at — every brick marked as new — and becomes a flow only when the
 * person says so. Without a model the field says why, and the examples
 * still work.
 */
export function StartScreen({ modelConfigured }: { modelConfigured: boolean }) {
  const t = useTranslations("flows.start");
  const locale = useLocale();
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState<{ document: FlowDocument; note: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const propose = async () => {
    const text = description.trim();
    if (text.length < 3 || asking) return;
    setAsking(true);
    const result = await askAi<FlowProposal>("propose-flow", { description: text }, { locale });
    setAsking(false);
    if (!result.ok) {
      toast.error(
        t(`failed.${result.error as AiFailure | "invalid" | "notFound" | "unauthorized"}`),
      );
      return;
    }
    if (!result.proposal.ok) {
      toast.error(t("failed.badAnswer"));
      return;
    }
    setProposal({ document: result.proposal.document, note: result.proposal.note });
  };

  const create = (input: Parameters<typeof createFlowAction>[0]) =>
    startTransition(async () => {
      const result = await createFlowAction(input);
      if (!result.ok) {
        toast.error(t("createFailed"));
        return;
      }
      router.push(`/flows/${result.data.flowId}`);
    });

  if (proposal) {
    const problems = validateDocument(proposal.document);
    const warnings = problems.filter((p) => p.severity === "warning").length;
    const marks = new Map<string, Mark>(
      [
        ...proposal.document.nodes.map((n) => n.id),
        ...proposal.document.edges.map((e) => e.id),
      ].map((id) => [id, "added"] as const),
    );
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{proposal.document.name}</h2>
          <p className="text-meta text-reading">{proposal.note || proposal.document.description}</p>
          {warnings > 0 ? (
            <p className="text-warning text-2sm">{t("warnings", { count: warnings })}</p>
          ) : null}
        </div>
        <div className="border-border h-[28rem] overflow-hidden rounded-lg border">
          <FlowCanvas
            document={proposal.document}
            problems={problems}
            marks={marks}
            selectedId={null}
            onSelect={() => {}}
            onConnect={() => {}}
            onDelete={() => {}}
            isValidConnection={() => false}
            readOnly
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              create({
                from: "document",
                document: proposal.document,
                proposedByAi: true,
                note: t("proposedMessage"),
              })
            }
          >
            {t("use")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setProposal(null)}
          >
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void propose();
        }}
      >
        <label htmlFor="describe" className="text-base font-semibold">
          {t("describe")}
        </label>
        <Textarea
          id="describe"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
          rows={7}
          placeholder={modelConfigured ? t("placeholder") : t("noModel")}
          disabled={!modelConfigured || asking}
          className="text-reading"
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={!modelConfigured || asking || description.trim().length < 3}
          >
            <SparklesIcon data-icon="inline-start" />
            {asking ? t("asking") : t("propose")}
          </Button>
          <p className="text-meta text-2sm">{t("hint")}</p>
        </div>
      </form>
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold">{t("examples")}</p>
        {EXAMPLE_FLOWS.map((example) => (
          <Card key={example.key} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">{example.document.name}</CardTitle>
              <CardDescription>{example.document.description}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => create({ from: "example", key: example.key })}
              >
                {t("useExample")}
              </Button>
            </CardContent>
          </Card>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={pending}
          onClick={() => create({ from: "blank" })}
        >
          {t("blank")}
        </Button>
      </div>
    </div>
  );
}
