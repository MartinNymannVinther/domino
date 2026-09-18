import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findValidInvitation } from "@/core/access/service";
import { signupAllowed } from "@/core/auth/signup";
import { Link } from "@/i18n/navigation";
import { AccessRequestForm } from "./access-request-form";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

/**
 * The front door, in three states.
 *
 * With a valid invitation in the link, the registration form, locked to
 * the address and organization the owner approved. With registration open
 * (or an empty installation), the plain form. Otherwise not a closed sign
 * but an application: a closed installation still wants to hear from the
 * people who would like to use it, and the owner decides.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const t = await getTranslations("auth.register");
  const { invitation: token } = await searchParams;

  if (token) {
    const invitation = await findValidInvitation(token);
    if (invitation) {
      return (
        <RegisterForm
          invitation={{
            token,
            email: invitation.email,
            organizationName: invitation.organizationName,
          }}
        />
      );
    }
    // A dead key is told apart from a closed door: the person holding it
    // did nothing wrong and should ask for a new link, not give up.
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invitationInvalidTitle")}</CardTitle>
          <CardDescription>{t("invitationInvalidBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 text-sm">
          <Link href="/register" className="font-medium underline-offset-4 hover:underline">
            {t("applyLink")}
          </Link>
          <Link href="/login" className="font-medium underline-offset-4 hover:underline">
            {t("loginLink")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (await signupAllowed()) {
    return <RegisterForm />;
  }

  return <AccessRequestForm />;
}
