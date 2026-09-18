"use client";

import {
  Building2,
  Check,
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/core/auth/client";
import { usePathname, useRouter } from "@/i18n/navigation";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const THEME_OPTIONS = [
  { value: "light", labelKey: "light", icon: Sun },
  { value: "dark", labelKey: "dark", icon: Moon },
  { value: "system", labelKey: "system", icon: Monitor },
] as const;

export function UserMenu({
  name,
  email,
  variant = "icon",
}: {
  name: string;
  email: string;
  variant?: "icon" | "row";
}) {
  const t = useTranslations("app.nav");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "row" ? (
            <Button
              variant="ghost"
              className="bg-sidebar-hover hover:bg-sidebar-accent h-auto w-full justify-start gap-2.5 rounded-[11px] px-3 py-2.5 text-left"
            >
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2sm font-semibold">{name}</span>
                <span className="text-meta block truncate text-xs font-normal">{email}</span>
              </span>
              <ChevronsUpDown data-slot="icon" className="shrink-0 opacity-50" />
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="rounded-full text-xs font-semibold">
              {initials(name)}
            </Button>
          )
        }
      />
      <DropdownMenuContent align={variant === "row" ? "start" : "end"} className="min-w-56">
        {/* Base UI: a GroupLabel must live inside a Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{name}</span>
            <span className="text-muted-foreground block truncate text-xs font-normal">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings/security")}>
          <Building2 data-slot="icon" />
          {t("settings")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun data-slot="icon" className="dark:hidden" />
            <Moon data-slot="icon" className="hidden dark:block" />
            {t("appearance")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEME_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
                <option.icon data-slot="icon" />
                <span className="flex-1">{t(option.labelKey)}</span>
                {(theme ?? "system") === option.value ? <Check data-slot="icon" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          onClick={() => router.replace(pathname, { locale: locale === "da" ? "en" : "da" })}
        >
          <Languages data-slot="icon" />
          {locale === "da" ? t("english") : t("danish")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut data-slot="icon" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
