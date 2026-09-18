"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { authClient } from "@/core/auth/client";
import { acceptInvitationAction, joinRegisterAction } from "@/core/team/actions";
import { Link, useRouter } from "@/i18n/navigation";

/** A field the invitation decided: visibly settled, not visibly disabled. */
const lockedClass = "bg-muted text-muted-foreground focus-visible:ring-0";

/** A new person: a name and a password for the address the invitation names. */
export function JoinRegisterForm({
  invitationId,
  email,
  workspaceName,
  intro,
}: {
  invitationId: string;
  email: string;
  workspaceName: string;
  intro: string;
}) {
  const t = useTranslations("join");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await joinRegisterAction({
      invitationId,
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!result.ok) {
      setPending(false);
      const messages = {
        emailExists: t("errorEmailExists"),
        invalid: t("errorInvalid"),
        invitationInvalid: t("invalidBody"),
        generic: t("errorGeneric"),
      };
      setError(messages[result.error]);
      return;
    }
    router.push("/flows");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="join-name">{t("name")}</FieldLabel>
              <Input
                id="join-name"
                name="name"
                autoComplete="name"
                required
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="join-email">{t("email")}</FieldLabel>
              <Input
                id="join-email"
                type="email"
                readOnly
                value={email}
                className={lockedClass}
                aria-describedby="join-locked"
              />
              <FieldDescription id="join-locked">
                {t("lockedHint", { workspace: workspaceName })}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="join-password">{t("password")}</FieldLabel>
              <Input
                id="join-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
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
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">{t("haveAccount")}&nbsp;</span>
        <Link
          href={`/login?next=/join/${invitationId}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {t("loginLink")}
        </Link>
      </CardFooter>
    </Card>
  );
}

/** Somebody signed in: accept, or sign out first when it is the wrong account. */
export function AcceptForm({
  invitationId,
  mode,
}: {
  invitationId: string;
  mode: "accept" | "switch";
}) {
  const t = useTranslations("join");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const result = await acceptInvitationAction({ invitationId });
    if (result !== "accepted") {
      setPending(false);
      setError(result === "wrongPerson" ? t("wrongPerson") : t("invalidBody"));
      return;
    }
    router.push("/flows");
    router.refresh();
  }

  async function switchAccount() {
    setPending(true);
    await authClient.signOut();
    router.refresh();
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {mode === "accept" ? (
        <Button type="button" onClick={accept} disabled={pending} className="w-full">
          {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
          {t("accept")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={switchAccount}
          disabled={pending}
          className="w-full"
        >
          {t("switchAccount")}
        </Button>
      )}
    </div>
  );
}
