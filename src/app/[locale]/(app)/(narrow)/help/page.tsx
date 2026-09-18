import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

const HOW_TO = ["flows", "bricks", "talk", "run", "history", "ai", "data"] as const;

/**
 * How the tool works, in the order a person meets it: a flow, the bricks
 * it is made of, the conversation that builds it, running it, reading
 * what happened, what the model may and may not do, and the way out.
 */
export default async function HelpPage() {
  const t = await getTranslations("help");

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-meta mt-1 text-sm">{t("intro")}</p>

      <h2 className="mt-10 text-xl font-semibold">{t("howToTitle")}</h2>
      {HOW_TO.map((key) => (
        <section key={key}>
          <h3 className="text-primary mt-5 text-reading font-semibold">
            {t(`howTo.${key}.title`)}
          </h3>
          <p className="mt-1.5 text-reading leading-relaxed">{t(`howTo.${key}.body`)}</p>
        </section>
      ))}

      <p className="border-border bg-card text-meta mt-10 rounded-xl border p-4 text-sm">
        {t("closing")}
      </p>
    </div>
  );
}
