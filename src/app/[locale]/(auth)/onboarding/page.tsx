import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) {
    redirect({ href: "/login", locale: await getLocale() });
  }
  return <OnboardingForm />;
}
