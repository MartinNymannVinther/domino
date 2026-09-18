"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/core/auth/client";
import { Link, useRouter } from "@/i18n/navigation";

export function LoginForm({ signupOpen }: { signupOpen: boolean }) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An invitation link sends people here to sign in first and then back;
  // only a path on this site is followed, never an address elsewhere.
  const next = useSearchParams().get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/flows";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const { data, error: apiError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (apiError) {
      // Deliberately generic: never reveal whether the account exists. The
      // one exception says nothing about accounts: the app was opened on
      // an address it is not set up for, and no password will ever work.
      setError(apiError.code === "INVALID_ORIGIN" ? t("errorOrigin") : t("error"));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push("/two-factor");
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function handlePasskey() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.passkey();
    setPending(false);
    if (result?.error) {
      setError(t("passkeyError"));
      return;
    }
    router.push(destination);
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
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username webauthn"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
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
        <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs uppercase">
          <span className="bg-border h-px flex-1" />
          {t("or")}
          <span className="bg-border h-px flex-1" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={handlePasskey}
        >
          <KeyRound data-slot="icon" />
          {t("withPasskey")}
        </Button>
      </CardContent>
      {signupOpen ? (
        <CardFooter className="justify-center text-sm">
          <span className="text-muted-foreground">{t("noAccount")}&nbsp;</span>
          <Link href="/register" className="font-medium underline-offset-4 hover:underline">
            {t("registerLink")}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
