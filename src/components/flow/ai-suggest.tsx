"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SchemaProposal, TextProposal } from "@/modules/ai/brick-assist";
import { askAi } from "@/modules/ai/read-client";
import type { StructuredSchema } from "@/modules/flow";

/**
 * The AI per brick, in the panel (CLAUDE.md, product principles): a
 * prompt finished, a schema from an example. Each answer is shown as a
 * suggestion beside the field and lands in the document only when the
 * person takes it. Without a model the buttons are not drawn; the
 * panel says so once, at the top.
 */

function failureWord(error: string): string {
  return `failed.${error}`;
}

export function SuggestPrompt({
  flowId,
  nodeId,
  onUse,
}: {
  flowId: string;
  nodeId: string;
  onUse: (text: string) => void;
}) {
  const t = useTranslations("flow.assist");
  const locale = useLocale();
  const [asking, setAsking] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const ask = async () => {
    setAsking(true);
    const result = await askAi<TextProposal>(
      "brick-assist",
      { ask: "prompt", flowId, nodeId },
      { locale },
    );
    setAsking(false);
    if (!result.ok) {
      toast.error(t(failureWord(result.error) as "failed.generic"));
      return;
    }
    if (!result.proposal.ok) {
      toast.error(t("failed.badAnswer"));
      return;
    }
    setSuggestion(result.proposal.text);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={asking}
        onClick={ask}
      >
        <SparklesIcon data-icon="inline-start" />
        {asking ? t("asking") : t("finishPrompt")}
      </Button>
      {suggestion !== null ? (
        <Suggestion
          onUse={() => {
            onUse(suggestion);
            setSuggestion(null);
          }}
          onDismiss={() => setSuggestion(null)}
        >
          <pre className="font-mono text-2sm leading-relaxed whitespace-pre-wrap">{suggestion}</pre>
        </Suggestion>
      ) : null}
    </div>
  );
}

export function SuggestSchema({ onUse }: { onUse: (schema: StructuredSchema) => void }) {
  const t = useTranslations("flow.assist");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [example, setExample] = useState("");
  const [hint, setHint] = useState("");
  const [asking, setAsking] = useState(false);
  const [suggestion, setSuggestion] = useState<StructuredSchema | null>(null);

  const ask = async () => {
    if (!example.trim()) return;
    setAsking(true);
    const result = await askAi<SchemaProposal>(
      "brick-assist",
      { ask: "schema", example, hint },
      { locale },
    );
    setAsking(false);
    if (!result.ok) {
      toast.error(t(failureWord(result.error) as "failed.generic"));
      return;
    }
    if (!result.proposal.ok) {
      toast.error(t("failed.badAnswer"));
      return;
    }
    setSuggestion(result.proposal.schema);
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        <SparklesIcon data-icon="inline-start" />
        {t("schemaFromExample")}
      </Button>
    );
  }
  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t("schemaFromExample")}</p>
      <Textarea
        value={example}
        onChange={(e) => setExample(e.target.value)}
        rows={6}
        placeholder={t("examplePlaceholder")}
        aria-label={t("exampleLabel")}
        className="text-2sm"
      />
      <Input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder={t("hintPlaceholder")}
        aria-label={t("hintLabel")}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={asking || !example.trim()} onClick={ask}>
          {asking ? t("asking") : t("propose")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("close")}
        </Button>
      </div>
      {suggestion ? (
        <Suggestion
          onUse={() => {
            onUse(suggestion);
            setSuggestion(null);
            setOpen(false);
          }}
          onDismiss={() => setSuggestion(null)}
        >
          <ul className="flex flex-col gap-1 text-2sm">
            {Object.entries(suggestion.properties).map(([name, property]) => (
              <li key={name}>
                <span className="font-medium">{name}</span>
                <span className="text-meta">
                  {" "}
                  · {property.type}
                  {"enum" in property && property.enum ? ` (${property.enum.join(", ")})` : ""}
                  {suggestion.required?.includes(name) ? ` · ${t("required")}` : ""}
                </span>
                {"description" in property && property.description ? (
                  <span className="text-meta"> — {property.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Suggestion>
      ) : null}
    </div>
  );
}

function Suggestion({
  children,
  onUse,
  onDismiss,
}: {
  children: React.ReactNode;
  onUse: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("flow.assist");
  return (
    <div className="bg-success-tint border-primary/30 flex flex-col gap-2 rounded-md border px-3 py-2">
      <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">
        {t("suggestion")}
      </p>
      {children}
      <div className="flex gap-2">
        <Button type="button" size="xs" onClick={onUse}>
          {t("use")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onDismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
