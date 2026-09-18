"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/core/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelInvitationAction,
  inviteMemberAction,
  leaveWorkspaceAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/core/team/actions";
import type { PendingInvitation } from "@/core/team/service";
import type { Member } from "@/modules/export/workspace";
import { useRouter } from "@/i18n/navigation";

/**
 * The team: who is in the workspace, the links waiting to be used, and
 * the form that makes a new one. No mail is sent — the link is shown once
 * and copied, and the person who invites sends it the way they talk to
 * their colleague anyway.
 */
export function MembersAdmin({
  members,
  memberIds,
  invitations,
  currentUserId,
  role,
}: {
  members: Member[];
  /** Membership row id per user, which is what the role and remove calls take. */
  memberIds: Record<string, string>;
  invitations: PendingInvitation[];
  currentUserId: string;
  role: string;
}) {
  const t = useTranslations("settings.members");
  const roles = useTranslations("settings.workspace.roles");
  const locale = useLocale();
  const router = useRouter();
  const canManage = role === "owner" || role === "admin";
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await inviteMemberAction({ email, role: inviteRole });
    setPending(false);
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      return;
    }
    setIssued({ email: result.data.email, url: result.data.url });
    setEmail("");
    router.refresh();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function act(fn: () => Promise<{ ok: boolean }>) {
    const result = await fn();
    if (!result.ok) toast.error(t("errors.generic"));
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const self = member.userId === currentUserId;
                const editable = canManage && !self && member.role !== "owner";
                return (
                  <TableRow key={member.userId}>
                    <TableCell>
                      {member.name}
                      {self && <span className="text-meta ml-1.5 text-xs">{t("you")}</span>}
                    </TableCell>
                    <TableCell className="text-meta">{member.email}</TableCell>
                    <TableCell>
                      {editable ? (
                        <NativeSelect
                          variant="sm"
                          value={member.role}
                          aria-label={t("role")}
                          className="w-32"
                          onChange={(event) =>
                            void act(() =>
                              updateMemberRoleAction({
                                memberId: memberIds[member.userId] ?? "",
                                role: event.target.value as "admin" | "member",
                              }),
                            )
                          }
                        >
                          <option value="member">{roles("member")}</option>
                          <option value="admin">{roles("admin")}</option>
                        </NativeSelect>
                      ) : (
                        roles(member.role)
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {editable && (
                          <ConfirmButton
                            title={t("removeTitle", { name: member.name })}
                            body={t("removeBody")}
                            confirmLabel={t("removeConfirm")}
                            onConfirm={() =>
                              act(() =>
                                removeMemberAction({ memberId: memberIds[member.userId] ?? "" }),
                              )
                            }
                            variant="ghost"
                            size="sm"
                          >
                            {t("remove")}
                          </ConfirmButton>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {role !== "owner" && (
            <div className="border-hairline mt-4 border-t pt-4">
              <ConfirmButton
                title={t("leaveTitle")}
                body={t("leaveBody")}
                confirmLabel={t("leaveConfirm")}
                onConfirm={async () => {
                  const result = await leaveWorkspaceAction();
                  if (result.ok) {
                    router.push("/onboarding");
                    router.refresh();
                  } else toast.error(t("errors.generic"));
                }}
                variant="outline"
                size="sm"
              >
                {t("leave")}
              </ConfirmButton>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("inviteTitle")}</CardTitle>
            <CardDescription>{t("inviteBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-label">{t("email")}</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={320}
                  className="h-9 w-64 text-2sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-label">{t("role")}</span>
                <NativeSelect
                  variant="sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                  className="w-32"
                >
                  <option value="member">{roles("member")}</option>
                  <option value="admin">{roles("admin")}</option>
                </NativeSelect>
              </label>
              <Button type="submit" size="sm" disabled={pending || !email}>
                {t("invite")}
              </Button>
            </form>
            {issued && (
              <div className="bg-accent/60 border-border flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">{t("issued", { email: issued.email })}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="bg-card border-border max-w-full truncate rounded border px-2 py-1 text-xs">
                    {issued.url}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(issued.url)}
                  >
                    {copied === issued.url ? <Check data-slot="icon" /> : <Copy data-slot="icon" />}
                    {copied === issued.url ? t("copied") : t("copy")}
                  </Button>
                </div>
                <p className="text-meta text-xs">{t("issuedHint")}</p>
              </div>
            )}
            {invitations.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pendingEmail")}</TableHead>
                    <TableHead>{t("role")}</TableHead>
                    <TableHead>{t("expires")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>{roles(invitation.role)}</TableCell>
                      <TableCell className="text-meta">
                        {formatDay(invitation.expiresAt, locale)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void copy(invitation.url)}
                        >
                          {copied === invitation.url ? t("copied") : t("copyLink")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void act(() => cancelInvitationAction({ invitationId: invitation.id }))
                          }
                        >
                          {t("cancel")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
