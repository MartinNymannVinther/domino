import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DEMO_TTL_HOURS } from "@/modules/demo/service";

/**
 * A stripe at the top of every page in a demo workspace. It says three
 * things a visitor needs and nobody would guess: this is a demo, it is
 * thrown away, and the way to keep something is to ask for an account.
 */
export async function DemoBanner() {
  const t = await getTranslations("demo");
  return (
    <div className="border-chart-4/40 bg-warning-tint flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-2 text-2sm sm:px-7 lg:px-8">
      <span className="font-semibold">{t("bannerTitle")}</span>
      <span className="text-meta">{t("bannerBody", { hours: DEMO_TTL_HOURS })}</span>
      <Link href="/register" className="text-primary ml-auto font-medium hover:underline">
        {t("bannerCta")}
      </Link>
    </div>
  );
}
