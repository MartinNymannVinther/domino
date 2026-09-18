import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["da", "en"],
  defaultLocale: "da",
  // Danish is served without a URL prefix (/flows), English under /en.
  localePrefix: "as-needed",
  // Danish-first and deterministic: no Accept-Language sniffing. English is
  // an explicit choice via /en, remembered by the locale cookie.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
