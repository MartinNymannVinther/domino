import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { PasskeyManager } from "./passkey-manager";
import { TotpManager } from "./totp-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.security");
  return { title: t("title") };
}

export default async function SecurityPage() {
  const t = await getTranslations("app.security");
  const session = await getSession();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>
      <PasskeyManager />
      <TotpManager initialEnabled={Boolean(session?.user.twoFactorEnabled)} />
    </div>
  );
}
