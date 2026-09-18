"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestAccessAction } from "@/core/access/actions";
import { Link } from "@/i18n/navigation";

/**
 * The application a closed installation shows instead of a closed sign.
 * No password and no account: it stores a request for the owner and
 * nothing else, and says so.
 */
export function AccessRequestForm() {
  const t = useTranslations("auth.apply");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const result = await requestAccessAction({
      name: String(form.get("name") ?? ""),
      email,
      organizationName: String(form.get("organizationName") ?? ""),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error === "tooMany" ? t("errorTooMany") : t("errorInvalid"));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sentTitle")}</CardTitle>
          <CardDescription>{t("sentBody", { email: sentTo })}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center text-sm">
          <Link href="/login" className="font-medium underline-offset-4 hover:underline">
            {t("loginLink")}
          </Link>
        </CardFooter>
      </Card>
    );
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
              <FieldLabel htmlFor="apply-name">{t("name")}</FieldLabel>
              <Input id="apply-name" name="name" autoComplete="name" required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="apply-email">{t("email")}</FieldLabel>
              <Input id="apply-email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="apply-organization">{t("organizationName")}</FieldLabel>
              <Input
                id="apply-organization"
                name="organizationName"
                autoComplete="organization"
                required
                maxLength={200}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="apply-message">{t("message")}</FieldLabel>
              <Textarea id="apply-message" name="message" rows={3} maxLength={1000} />
              <FieldDescription>{t("messageHint")}</FieldDescription>
            </Field>
            {/* Honeypot: hidden from people, irresistible to bots. */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="apply-website">Website</label>
              <input
                id="apply-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
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
          <p className="text-muted-foreground text-xs leading-relaxed">{t("privacy")}</p>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">{t("haveAccount")}&nbsp;</span>
        <Link href="/login" className="font-medium underline-offset-4 hover:underline">
          {t("loginLink")}
        </Link>
      </CardFooter>
    </Card>
  );
}
