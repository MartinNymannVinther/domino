"use client";

import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/core/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/core/auth/client";

type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
};

export function PasskeyManager() {
  const t = useTranslations("app.security.passkeys");
  const locale = useLocale();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await authClient.passkey.listUserPasskeys();
    setPasskeys(data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    authClient.passkey
      .listUserPasskeys()
      .then(({ data }) => {
        if (!cancelled) setPasskeys(data ?? []);
      })
      .catch(() => {
        // List stays empty; the user can still add a passkey.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.passkey.addPasskey({ name: name || undefined });
    setPending(false);
    if (result?.error) {
      setError(t("error"));
      return;
    }
    setName("");
    toast.success(t("addedToast"));
    await refresh();
  }

  async function handleRemove(id: string) {
    await authClient.passkey.deletePasskey({ id });
    toast.success(t("removedToast"));
    await refresh();
  }

  function formatDate(value: Passkey["createdAt"]): string | null {
    if (!value) return null;
    return formatDay(new Date(value), locale);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passkeys.map((passkey) => {
              const added = formatDate(passkey.createdAt);
              return (
                <li
                  key={passkey.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <KeyRound className="size-4 shrink-0" />
                    <span className="truncate font-medium">{passkey.name || "Passkey"}</span>
                    {added ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {t("addedAt", { date: added })}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("remove")}
                    onClick={() => handleRemove(passkey.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <Field className="max-w-xs flex-1">
            <FieldLabel htmlFor="passkey-name">{t("nameLabel")}</FieldLabel>
            <Input
              id="passkey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={100}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("add")}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
