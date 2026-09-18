"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MODEL } from "@/core/llm/models";
import type { ModelSettingsView, ProviderChoice } from "@/modules/ai/model-settings";
import { saveModelSettingsAction } from "./actions";

/**
 * The workspace's own model. Four choices, because "follow the
 * installation" has to be one of them and has to be the one you land on:
 * inheriting is the normal case, and leaving it should be a single move
 * back, not a guess at what the default was.
 *
 * The key is write-only. The form can say a key is stored and offer to
 * replace or remove it; it never receives one back, so a screen share or
 * a browser extension has nothing to read.
 */
export function ModelForm({
  settings,
  canEdit,
}: {
  settings: ModelSettingsView;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.ai.model");
  const [choice, setChoice] = useState<ProviderChoice>(settings.choice);
  const [model, setModel] = useState(settings.model);
  const [key, setKey] = useState("");
  const [hasOwnKey, setHasOwnKey] = useState(settings.hasOwnKey);
  const [pending, startTransition] = useTransition();

  const placeholder =
    choice === "mistral" ? DEFAULT_MODEL.mistral : choice === "ollama" ? DEFAULT_MODEL.ollama : "";

  const save = (apiKey: "keep" | "clear" | string) =>
    startTransition(async () => {
      const result = await saveModelSettingsAction({ provider: choice, model, apiKey });
      if (!result.ok) {
        toast.error(result.error === "unauthorized" ? t("notAllowed") : t("saveFailed"));
        return;
      }
      setKey("");
      setHasOwnKey(result.settings.hasOwnKey);
      setChoice(result.settings.choice);
      setModel(result.settings.model);
      toast.success(t("saved"));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="llm-provider">{t("providerLabel")}</Label>
        <select
          id="llm-provider"
          value={choice}
          disabled={!canEdit || pending}
          onChange={(e) => setChoice(e.target.value as ProviderChoice)}
          className="border-input bg-card focus-visible:ring-ring h-[2.625rem] rounded-md border px-3 text-sm outline-none focus-visible:ring-2 disabled:opacity-45"
        >
          <option value="inherit">
            {t("inherit", {
              provider:
                settings.installation.provider === "none"
                  ? t("shortNone")
                  : t(`short_${settings.installation.provider}`),
            })}
          </option>
          <option value="mistral">{t("provider_mistral")}</option>
          <option value="ollama">{t("provider_ollama")}</option>
          <option value="none">{t("providerNone")}</option>
        </select>
        {/* The address rule only matters to somebody looking at Ollama;
            saying it under Mistral is noise in a form that is already
            four fields long. */}
        {(choice === "ollama" ||
          (choice === "inherit" && settings.installation.provider === "ollama")) && (
          <p className="text-meta text-xs">{t("providerHelp")}</p>
        )}
      </div>

      {(choice === "mistral" || choice === "ollama") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llm-model">{t("modelLabel")}</Label>
          <Input
            id="llm-model"
            value={model}
            disabled={!canEdit || pending}
            onChange={(e) => setModel(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-meta text-xs">
            {choice === "ollama" ? t("modelHelpOllama") : t("modelHelpMistral", { placeholder })}
          </p>
        </div>
      )}

      {choice === "mistral" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="llm-key">{t("keyLabel")}</Label>
          <Input
            id="llm-key"
            type="password"
            value={key}
            disabled={!canEdit || pending}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasOwnKey ? t("keyStored") : t("keyPlaceholder")}
            autoComplete="off"
          />
          <p className="text-meta text-xs">{hasOwnKey ? t("keyStoredHelp") : t("keyHelp")}</p>
          {hasOwnKey && canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={pending}
              onClick={() => save("clear")}
            >
              {t("keyRemove")}
            </Button>
          )}
        </div>
      )}

      {canEdit ? (
        <Button
          type="button"
          className="w-fit"
          disabled={pending}
          onClick={() => save(key.trim() ? key.trim() : "keep")}
        >
          {pending ? t("saving") : t("save")}
        </Button>
      ) : (
        <p className="text-meta text-sm">{t("notAllowed")}</p>
      )}
    </div>
  );
}
