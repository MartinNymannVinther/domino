import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/core/auth/session";
import { findTeamInvitation } from "@/core/team/service";
import { Link } from "@/i18n/navigation";
import { AcceptForm, JoinRegisterForm } from "./join-forms";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("join");
  return { title: t("title") };
}

/**
 * The page behind an invitation link. It says who invited whom into
 * what, and then does the one right thing for whoever opened it: a
 * stranger registers for the address the invitation names, the person
 * it was sent to accepts with one click, and somebody signed in as
 * anyone else is told so rather than let through.
 */
export default async function JoinPage({ params }: Params) {
  const { id } = await params;
  const t = await getTranslations("join");
  const invitation = await findTeamInvitation(id);
  const session = await getSession();

  if (!invitation || invitation.state !== "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invalidTitle")}</CardTitle>
          <CardDescription>
            {invitation?.state === "accepted" ? t("acceptedBody") : t("invalidBody")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("toLogin")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const intro = t("intro", {
    inviter: invitation.inviterName || t("someone"),
    workspace: invitation.workspaceName,
  });

  if (session && session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{intro}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>{t("wrongAccount", { email: invitation.email, current: session.user.email })}</p>
          <AcceptForm invitationId={invitation.id} mode="switch" />
        </CardContent>
      </Card>
    );
  }

  if (session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{intro}</CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptForm invitationId={invitation.id} mode="accept" />
        </CardContent>
      </Card>
    );
  }

  return (
    <JoinRegisterForm
      invitationId={invitation.id}
      email={invitation.email}
      workspaceName={invitation.workspaceName}
      intro={intro}
    />
  );
}
