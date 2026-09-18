import { Database, ShieldCheck, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { getSession } from "@/core/auth/session";
import { buildInfo } from "@/core/version";
import { signupAllowed } from "@/core/auth/signup";
import { Link, redirect } from "@/i18n/navigation";
import { demoEnabled, DEMO_TTL_HOURS } from "@/modules/demo/service";
import { cn } from "@/lib/utils";

const VALUES = [
  { icon: Sparkles, titleKey: "aiTitle", bodyKey: "aiBody" },
  { icon: Database, titleKey: "dataTitle", bodyKey: "dataBody" },
  { icon: ShieldCheck, titleKey: "securityTitle", bodyKey: "securityBody" },
] as const;

const FLOW_KEYS = ["talk", "bricks", "diff", "test", "steps", "history", "ai"] as const;

/** The family's front door; the wider story lives there, not here. */
const HAIJ_URL = "https://haij.dk";

export default async function HomePage() {
  const session = await getSession();
  const locale = await getLocale();
  // The same button leads to /register either way; what it promises should
  // match what is behind it: an account, or an application for one.
  const open = await signupAllowed();
  const demo = demoEnabled();
  if (session) {
    redirect({ href: "/flows", locale });
    return null;
  }
  const t = await getTranslations("landing");

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark className="text-xl" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            {t("nav.login")}
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            {open ? t("nav.register") : t("nav.apply")}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative isolate overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]"
            style={{
              background:
                "radial-gradient(42rem 22rem at 50% -4rem, color-mix(in oklch, var(--primary) 9%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-24">
            <p className="border-border/80 bg-card/60 text-muted-foreground mb-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs shadow-xs">
              <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
              {/* Read from the build rather than written into the copy:
                  a version in a sentence is a version that goes stale. */}
              {t("status", { version: buildInfo.version })}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg text-pretty">
              {t("hero.subtitle")}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
                {open ? t("hero.ctaPrimary") : t("hero.ctaApply")}
              </Link>
              {demo && (
                <a
                  href={`${locale === "da" ? "" : `/${locale}`}/demo`}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
                >
                  {t("hero.ctaDemo")}
                </a>
              )}
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: demo ? "ghost" : "outline", size: "lg" }),
                  "px-4",
                )}
              >
                {t("hero.ctaSecondary")}
              </Link>
            </div>
            <p className="text-muted-foreground mt-6 text-xs">{t("hero.trust")}</p>
          </div>

          <div className="mx-auto w-full max-w-4xl px-6 pb-16">
            <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wide uppercase">
              {t("flowsLabel")}
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {FLOW_KEYS.map((key) => (
                <li
                  key={key}
                  className="border-border/80 bg-card text-foreground/80 rounded-full border px-3 py-1 text-xs"
                >
                  {t(`flows.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {demo && (
          <section className="mx-auto w-full max-w-3xl px-6 pb-16">
            <div className="border-chart-4/40 bg-warning-tint rounded-xl border p-5">
              <h2 className="font-heading text-base font-semibold">{t("demo.title")}</h2>
              <p className="mt-1.5 text-sm">{t("demo.body", { hours: DEMO_TTL_HOURS })}</p>
              <p className="text-meta mt-1.5 text-sm">{t("demo.privacy")}</p>
              <a
                href={`${locale === "da" ? "" : `/${locale}`}/demo`}
                className={cn(buttonVariants({ size: "sm" }), "mt-3")}
              >
                {t("demo.cta")}
              </a>
            </div>
          </section>
        )}

        <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-16 sm:grid-cols-3">
          {VALUES.map((value) => (
            <div
              key={value.titleKey}
              className="bg-card ring-foreground/10 shadow-[var(--surface-shadow)] rounded-xl p-6 ring-1 transition-shadow hover:shadow-md"
            >
              <div className="bg-accent text-accent-foreground mb-4 flex size-9 items-center justify-center rounded-lg">
                <value.icon className="size-4.5" />
              </div>
              <h2 className="font-medium">{t(`values.${value.titleKey}`)}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm">{t(`values.${value.bodyKey}`)}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto w-full max-w-3xl px-6 pb-24 text-center">
          <p className="text-muted-foreground text-sm text-pretty">
            {t("family.body")}{" "}
            <a
              href={HAIJ_URL}
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              {t("family.link")}
            </a>
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm">
          <p className="flex items-center gap-2">
            <Wordmark />
            <span>· {t("footer.license")}</span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/terms" className="underline-offset-4 hover:underline">
              {t("footer.terms")}
            </Link>
            <Link
              href="/"
              locale={locale === "da" ? "en" : "da"}
              className="underline-offset-4 hover:underline"
            >
              {t("footer.language")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
