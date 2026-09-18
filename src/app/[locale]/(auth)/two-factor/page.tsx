import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TwoFactorForm } from "./two-factor-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.twoFactor");
  return { title: t("title") };
}

export default function TwoFactorPage() {
  return <TwoFactorForm />;
}
