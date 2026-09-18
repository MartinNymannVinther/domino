import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { demoEnabled, DEMO_TTL_HOURS } from "@/modules/demo/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return { title: t("title") };
}

const SECTIONS = [
  "what",
  "account",
  "yourData",
  "ai",
  "shareLinks",
  "leaving",
  "availability",
  "license",
] as const;

/**
 * Terms and privacy on one page, in plain language. Two pages would be
 * two pages nobody reads; the dogmas make most of this short, because
 * "your data, always" and "EU or self-hosted" are the answer to nearly
 * every question a person has here.
 */
export default async function TermsPage() {
  const t = await getTranslations("terms");
  const locale = await getLocale();

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/">
          <Wordmark className="text-xl" />
        </Link>
        <Link href="/" className="text-meta hover:text-foreground text-sm">
          {t("back")}
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20">
        <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
        <p className="text-meta mt-2 text-sm">{t("updated")}</p>
        <p className="mt-6 text-reading leading-relaxed">{t("intro")}</p>

        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="font-heading mt-8 text-lg font-semibold">{t(`${key}.title`)}</h2>
            <p className="mt-1.5 text-reading leading-relaxed">{t(`${key}.body`)}</p>
          </section>
        ))}

        {demoEnabled() && (
          <section>
            <h2 className="font-heading mt-8 text-lg font-semibold">{t("demo.title")}</h2>
            <p className="mt-1.5 text-reading leading-relaxed">
              {t("demo.body", { hours: DEMO_TTL_HOURS })}
            </p>
          </section>
        )}

        <section>
          <h2 className="font-heading mt-8 text-lg font-semibold">{t("contact.title")}</h2>
          <p className="mt-1.5 text-reading leading-relaxed">{t("contact.body")}</p>
        </section>

        <p className="text-meta mt-10 text-sm">
          {t("subprocessorsNote")}{" "}
          <a
            href="https://github.com/MartinNymannVinther/domino/blob/main/docs/subprocessors.md"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            docs/subprocessors.md
          </a>
          .
        </p>
        <p className="text-meta mt-2 text-sm">
          <Link
            href="/"
            locale={locale === "da" ? "en" : "da"}
            className="underline-offset-4 hover:underline"
          >
            {t("language")}
          </Link>
        </p>
      </main>
    </div>
  );
}
