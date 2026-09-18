import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import {
  MAX_CALLS_PER_INSTALLATION_PER_DAY,
  MAX_CALLS_PER_USER_PER_HOUR,
  MAX_CALLS_PER_WORKSPACE_PER_DAY,
  MAX_INPUT_CHARS,
} from "@/modules/ai/limits";
import { getModelSettings } from "@/modules/ai/model-settings";
import { currentRole } from "@/modules/export/workspace";
import { ModelForm } from "./model-form";
import { TestConnection } from "./test-connection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.ai");
  return { title: t("title") };
}

/**
 * Which model answers, and what it is allowed to do. The page says
 * plainly what a Domino without a model can and cannot do: flows can be
 * drawn, kept and exported, but nothing can run and nothing can be
 * proposed, and the buttons say so rather than fail.
 *
 * The workspace can also choose its own model. The installation's setting
 * is the default it inherits, and the card shows what is actually in
 * force before it shows the form that changes it.
 */
export default async function AiSettingsPage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("settings.ai");
  const settings = await getModelSettings(context);
  const role = await currentRole(context);
  const canEdit = role === "owner" || role === "admin";
  const active = settings.effective.provider !== "none" && settings.effective.model !== "";
  const installationCap = MAX_CALLS_PER_INSTALLATION_PER_DAY;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            {t("providerTitle")}
          </CardTitle>
          <CardDescription>{t("providerHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {active ? (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("provider")}</span>
                <Badge className="bg-primary/15 text-primary border-transparent">
                  {t(`model.provider_${settings.effective.provider}`)}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("model.current")}</span>
                <span className="font-medium tabular-nums">{settings.effective.model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("model.source")}</span>
                <span className="text-meta">
                  {settings.choice === "inherit"
                    ? t("model.fromInstallation")
                    : t("model.fromWorkspace")}
                </span>
              </div>
              {settings.effective.provider === "mistral" && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("model.keySource")}</span>
                  <span className="text-meta">
                    {settings.effective.keyFrom === "workspace"
                      ? t("model.keyFromWorkspace")
                      : settings.effective.keyFrom === "installation"
                        ? t("model.keyFromInstallation")
                        : t("model.keyMissing")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <Badge className="border-border text-muted-foreground w-fit bg-transparent">
                {t("noModel")}
              </Badge>
              <p className="text-muted-foreground">{t("setupIntro")}</p>
              {/* The settings themselves are the same in every language;
                  the comments and the placeholder are not. */}
              <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed">
                {[
                  `# .env — ${t("setupEuComment")}`,
                  "LLM_PROVIDER=mistral",
                  `MISTRAL_API_KEY=${t("setupKeyPlaceholder")}`,
                  "",
                  `# ${t("setupLocalComment")}`,
                  "LLM_PROVIDER=ollama",
                  "OLLAMA_BASE_URL=http://localhost:11434",
                ].join("\n")}
              </pre>
              <p className="text-muted-foreground">{t("setupOutro")}</p>
            </div>
          )}
          {/* Configured is not the same as working, and only the
              second one is worth telling somebody. The test spends a real
              model call, so it is offered to the people who own the bill;
              the action checks the same thing again for itself. */}
          {canEdit && <TestConnection />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("model.title")}</CardTitle>
          <CardDescription>{t("model.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ModelForm settings={settings} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("withoutTitle")}</CardTitle>
          <CardDescription>{t("withoutBody")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("limitsTitle")}</CardTitle>
          <CardDescription>{t("limitsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("perUser")}</span>
            <span className="font-medium tabular-nums">{MAX_CALLS_PER_USER_PER_HOUR}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("perWorkspace")}</span>
            <span className="font-medium tabular-nums">{MAX_CALLS_PER_WORKSPACE_PER_DAY}</span>
          </div>
          {/* The installation's own roof (docs/adr/0035) can refuse a
              workspace that has spent nothing, so a page that lists the
              other two and not this one is a page that lies by omission.
              Zero means the installation has taken the roof off. */}
          {installationCap > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("perInstallation")}</span>
              <span className="font-medium tabular-nums">{installationCap}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("messageLength")}</span>
            <span className="font-medium tabular-nums">{MAX_INPUT_CHARS}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("principlesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>{t("principleDecides")}</p>
          <p>{t("principleUndo")}</p>
          <p>{t("principleData")}</p>
          <p>{t("principleSovereign")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
