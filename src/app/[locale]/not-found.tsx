import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";

export default async function NotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-7 p-8 text-center">
      <Wordmark className="text-[1.375rem]" />
      <div className="flex max-w-md flex-col gap-2.5">
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-reading leading-relaxed">{t("body")}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("cta")}
      </Link>
    </main>
  );
}
