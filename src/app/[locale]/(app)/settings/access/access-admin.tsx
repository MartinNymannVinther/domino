"use client";

import { Check, Copy, Loader2, RefreshCw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/core/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  approveAccessRequestAction,
  createInvitationAction,
  declineAccessRequestAction,
  type IssuedLink,
} from "@/core/access/actions";
import { invitationState } from "@/core/access/state";
import { useRouter } from "@/i18n/navigation";

export type RequestItem = {
  id: string;
  name: string;
  email: string;
  organizationName: string;
  message: string | null;
  status: "pending" | "approved" | "declined";
  createdAt: Date;
  decidedAt: Date | null;
};

export type InvitationItem = {
  id: string;
  email: string;
  organizationName: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/**
 * Approve, decline, invite, and the one thing that cannot be looked up
 * later: the link. It is shown once, right after it is minted, because
 * only its hash is stored. "New link" mints another and retires the old.
 */
export function AccessAdmin({
  requests,
  invitations,
}: {
  requests: RequestItem[];
  invitations: InvitationItem[];
}) {
  const t = useTranslations("settings.access");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [fresh, setFresh] = useState<IssuedLink | null>(null);

  const formatDate = (value: Date | string) => formatDay(new Date(value), locale);

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 10);

  // try/finally on both: an action that rejects rather than returns would
  // otherwise leave the row disabled for good, with nothing said about why.
  async function approve(id: string) {
    setBusy(id);
    try {
      const result = await approveAccessRequestAction(id);
      if (!result.ok) return void toast.error(tCommon("error"));
      setFresh(result.data);
      router.refresh();
    } catch (error) {
      console.error("access: approve failed", error);
      toast.error(tCommon("error"));
    } finally {
      setBusy(null);
    }
  }

  async function decline(id: string) {
    setBusy(id);
    try {
      const result = await declineAccessRequestAction(id);
      if (!result.ok) return void toast.error(tCommon("error"));
      toast.success(t("declinedToast"));
      router.refresh();
    } catch (error) {
      console.error("access: decline failed", error);
      toast.error(tCommon("error"));
    } finally {
      setBusy(null);
    }
  }

  async function invite(email: string, organizationName: string) {
    const result = await createInvitationAction({ email, organizationName });
    if (!result.ok) {
      toast.error(result.error === "invalid" ? t("errorInvalid") : tCommon("error"));
      return false;
    }
    setFresh(result.data);
    router.refresh();
    return true;
  }

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setInviting(true);
    const ok = await invite(
      String(form.get("email") ?? ""),
      String(form.get("organizationName") ?? ""),
    );
    setInviting(false);
    if (ok) formElement.reset();
  }

  async function copyFresh() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      toast.success(t("copiedToast"));
    } catch {
      toast.error(tCommon("error"));
    }
  }

  const stateLabel = {
    open: t("stateOpen"),
    used: t("stateUsed"),
    expired: t("stateExpired"),
    revoked: t("stateRevoked"),
  } as const;

  return (
    <div className="flex flex-col gap-5">
      {fresh ? (
        <div className="border-primary/40 bg-accent rounded-lg border p-4">
          <p className="text-sm font-semibold">{t("linkTitle", { email: fresh.email })}</p>
          <p className="text-meta mt-1 text-2sm leading-relaxed">{t("linkBody")}</p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={fresh.url} className="min-w-0 flex-1 font-mono text-xs" />
            <Button type="button" size="sm" onClick={copyFresh}>
              <Copy data-slot="icon" />
              {t("copy")}
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("pendingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("pendingEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {pending.map((request) => (
                <li
                  key={request.id}
                  className="border-border flex flex-col gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {request.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {request.organizationName}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{request.email}</p>
                    {request.message ? (
                      <p className="mt-1.5 leading-relaxed whitespace-pre-line">
                        {request.message}
                      </p>
                    ) : null}
                    <p className="text-meta mt-1 text-xs">
                      {t("applied", { date: formatDate(request.createdAt) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve(request.id)}
                      disabled={busy === request.id}
                    >
                      {busy === request.id ? (
                        <Loader2 data-slot="icon" className="animate-spin" />
                      ) : (
                        <Check data-slot="icon" />
                      )}
                      {t("approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => decline(request.id)}
                      disabled={busy === request.id}
                    >
                      <X data-slot="icon" />
                      {t("decline")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("inviteTitle")}</CardTitle>
          <CardDescription>{t("inviteBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-3">
            <FieldGroup className="sm:flex-row sm:gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="invite-email">{t("inviteEmail")}</FieldLabel>
                <Input id="invite-email" name="email" type="email" required />
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="invite-organization">{t("inviteOrganization")}</FieldLabel>
                <Input id="invite-organization" name="organizationName" required maxLength={200} />
              </Field>
            </FieldGroup>
            <Button type="submit" variant="outline" className="w-fit" disabled={inviting}>
              {inviting ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {t("inviteSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invitationsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("invitationsEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {invitations.map((invitation) => {
                const state = invitationState(invitation);
                return (
                  <li
                    key={invitation.id}
                    className="border-border flex items-center gap-3 border-b py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {invitation.email}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {invitation.organizationName}
                        </span>
                      </p>
                      <p className="text-meta text-xs">
                        {state === "used" && invitation.usedAt
                          ? t("used", { date: formatDate(invitation.usedAt) })
                          : t("expires", { date: formatDate(invitation.expiresAt) })}
                      </p>
                    </div>
                    <Badge variant={state === "open" ? "default" : "outline"}>
                      {stateLabel[state]}
                    </Badge>
                    {state === "open" || state === "expired" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => invite(invitation.email, invitation.organizationName)}
                      >
                        <RefreshCw data-slot="icon" />
                        {t("renew")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {decided.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {decided.map((request) => (
                <li
                  key={request.id}
                  className="border-border flex items-center gap-3 border-b py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {request.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {request.organizationName}
                      </span>
                    </p>
                    <p className="text-muted-foreground truncate">{request.email}</p>
                  </div>
                  <Badge variant="outline">
                    {request.status === "approved"
                      ? t("decidedApproved", {
                          date: formatDate(request.decidedAt ?? request.createdAt),
                        })
                      : t("decidedDeclined", {
                          date: formatDate(request.decidedAt ?? request.createdAt),
                        })}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
