"use client";

import { useTranslations } from "next-intl";
import { CountPill } from "@/components/ui/count-pill";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The app navigation. Text only, per the 2a handoff: Domino has few enough
 * places to go that icons would only add noise. Rendered in the desktop
 * sidebar and inside the mobile sheet, where `onNavigate` lets the sheet
 * close itself.
 */
const ITEMS: Array<{ href: string; key: "flows" | "help" }> = [
  { href: "/flows", key: "flows" },
  { href: "/help", key: "help" },
];

export function navItemClass(active: boolean): string {
  return cn(
    "block rounded-[9px] px-3 py-2.5 text-sm transition-colors duration-[120ms] ease-out",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
      : "text-sidebar-foreground hover:bg-sidebar-hover",
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={navItemClass(active)}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Settings sits apart at the foot of the sidebar, above the user card. The
 * count is the installation owner's: applications waiting for a decision.
 */
export function SidebarSettingsLink({
  onNavigate,
  attention = 0,
}: {
  onNavigate?: () => void;
  attention?: number;
}) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  return (
    <Link
      href={attention > 0 ? "/settings/access" : "/settings/security"}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(navItemClass(active), "flex items-center")}
    >
      {t("settings")}
      <CountPill count={attention} />
    </Link>
  );
}
