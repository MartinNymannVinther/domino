"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceAction } from "@/modules/export/actions";

/**
 * The way out. Typing the workspace's own name is the only confirmation
 * that cannot be clicked through by habit, and the copy says exactly what
 * goes: everything, including the audit trail about it. The export is one
 * page away and is offered here in words rather than as a step to skip.
 */
export function DeleteWorkspaceCard({ workspaceName }: { workspaceName: string }) {
  const t = useTranslations("settings.workspace.delete");
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-meta text-2sm leading-relaxed">{t("exportFirst")}</p>
        <label htmlFor="confirm-name" className="text-sm">
          {t("typeName", { name: workspaceName })}
        </label>
        <Input
          id="confirm-name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={workspaceName}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="destructive"
          className="w-fit"
          disabled={pending || typed.trim() !== workspaceName.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteWorkspaceAction({ name: typed });
              if (!result.ok) {
                toast.error(t("failed"));
                return;
              }
              if (result.data === "notOwner") toast.error(t("notOwner"));
              else if (result.data === "nameMismatch") toast.error(t("nameMismatch"));
              else if (result.data === "failed") toast.error(t("failed"));
            })
          }
        >
          {pending ? t("deleting") : t("action")}
        </Button>
      </CardContent>
    </Card>
  );
}
