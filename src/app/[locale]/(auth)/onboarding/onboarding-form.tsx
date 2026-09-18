"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/core/auth/client";
import { useRouter } from "@/i18n/navigation";
import { organizationSlug } from "@/lib/slug";

export function OnboardingForm() {
  const t = useTranslations("auth.onboarding");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const name = String(new FormData(event.currentTarget).get("organizationName") ?? "");
    const { data, error: createError } = await authClient.organization.create({
      name,
      slug: organizationSlug(name),
    });
    if (createError || !data) {
      setPending(false);
      setError(t("error"));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push("/flows");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organizationName">{t("organizationName")}</FieldLabel>
              <Input id="organizationName" name="organizationName" required maxLength={200} />
            </Field>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
