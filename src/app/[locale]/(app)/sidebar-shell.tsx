"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Showing and hiding the navigation rail. Desktop only: on a phone the
 * menu already lives behind the burger, and hiding what is not there
 * would be a setting for nothing.
 *
 * The choice is kept in a cookie rather than in local storage, so the
 * server renders the right layout on the first pass. A person who hid the
 * menu should not watch it appear and disappear on every page load.
 */

const COOKIE = "domino-sidebar";
const SIDEBAR_ID = "app-sidebar";

const SidebarContext = createContext<{ hidden: boolean; toggle: () => void } | null>(null);

export function SidebarShell({
  defaultHidden,
  sidebar,
  children,
}: {
  defaultHidden: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(defaultHidden);

  const toggle = useCallback(() => {
    setHidden((was) => {
      const next = !was;
      // A year, path-wide, no third party involved: this is a preference,
      // not a tracker, and it carries nothing but the word.
      document.cookie = `${COOKIE}=${next ? "hidden" : "shown"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    // A fragment, not a wrapper: the rail and the content column are
    // siblings in the layout's own flex row, and an extra box between them
    // would stop the content growing into the space the rail left behind.
    <SidebarContext.Provider value={{ hidden, toggle }}>
      {!hidden && sidebar}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          // The dividing line belongs to the content area, so it goes
          // when there is nothing on the other side of it.
          hidden ? "lg:pl-12" : "border-border lg:border-l",
        )}
      >
        {hidden && <SidebarToggle placement="floating" />}
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarToggle({ placement }: { placement: "sidebar" | "floating" }) {
  const t = useTranslations("app.nav");
  const context = useContext(SidebarContext);
  if (!context) return null;
  const { hidden, toggle } = context;
  const Icon = hidden ? PanelLeft : PanelLeftClose;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? t("showMenu") : t("hideMenu")}
      aria-expanded={!hidden}
      aria-controls={SIDEBAR_ID}
      title={hidden ? t("showMenu") : t("hideMenu")}
      className={cn(
        "text-meta hover:text-foreground hover:bg-sidebar-hover focus-visible:ring-ring hidden size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-[120ms] ease-out focus-visible:ring-2 focus-visible:outline-none lg:flex",
        placement === "floating" && "bg-card border-border fixed top-3 left-3 z-40 border",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

export { SIDEBAR_ID };
