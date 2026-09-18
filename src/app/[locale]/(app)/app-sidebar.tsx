import { getTranslations } from "next-intl/server";
import { WordmarkLockup } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";
import { OrgSwitcher } from "./org-switcher";
import { SidebarNav, SidebarSettingsLink } from "./sidebar-nav";
import { SIDEBAR_ID } from "./sidebar-shell";
import { UserMenu } from "./user-menu";
import { VersionLink } from "./version-link";

/**
 * The 2a navigation rail: 236 px on the sidebar ground with no outer edge of
 * its own - the content area carries the dividing line. Lockup on top,
 * navigation in the middle, settings and the user card at the foot.
 */
export async function AppSidebar({
  userName,
  userEmail,
  organization,
  attention = 0,
  toggle,
}: {
  userName: string;
  userEmail: string;
  organization: string;
  /** Items waiting for the installation's owner; zero for everyone else. */
  attention?: number;
  /** The control that folds the rail away; rendered next to the lockup. */
  toggle?: React.ReactNode;
}) {
  const t = await getTranslations("app.orgSwitcher");
  const switchLabel = t("switch");
  return (
    <aside
      id={SIDEBAR_ID}
      className="bg-sidebar sticky top-0 hidden h-svh w-[236px] shrink-0 flex-col lg:flex"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-5 pb-3">
        <Link
          href="/flows"
          aria-label="Domino"
          className="block w-fit transition-opacity hover:opacity-80"
        >
          <WordmarkLockup organization={organization} />
        </Link>
        {toggle}
      </div>
      <SidebarNav />
      <div className="flex flex-col gap-1.5 px-3 pt-1 pb-3">
        <OrgSwitcher
          triggerClassName="text-sidebar-foreground hover:bg-sidebar-hover h-auto w-full justify-between rounded-[9px] px-3 py-2.5 text-sm font-normal"
          label={switchLabel}
        />
        <SidebarSettingsLink attention={attention} />
        <UserMenu name={userName} email={userEmail} variant="row" />
        <VersionLink />
      </div>
    </aside>
  );
}
