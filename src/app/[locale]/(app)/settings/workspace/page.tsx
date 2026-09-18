import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { formatDay } from "@/core/dates";
import { memberships, organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { listPendingInvitations } from "@/core/team/service";
import { redirect } from "@/i18n/navigation";
import { currentRole, listMembers } from "@/modules/export/workspace";
import { DeleteWorkspaceCard } from "./delete-workspace-card";
import { MembersAdmin } from "./members-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.workspace");
  return { title: t("title") };
}

/**
 * The workspace itself: who is in it, how somebody else gets in, and the
 * way out. Deletion lives at the bottom, behind the workspace's own name
 * typed by hand, because it takes everything — the flows, the runs, the
 * files and the audit rows about them.
 */
export default async function WorkspaceSettingsPage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }

  const t = await getTranslations("settings.workspace");
  const locale = await getLocale();
  const [workspace, memberRows] = await withOrgContext(context, async (tx) => {
    const [org] = await tx
      .select({ name: organizations.name, createdAt: organizations.createdAt })
      .from(organizations)
      .where(eq(organizations.id, context.orgId))
      .limit(1);
    const rows = await tx
      .select({ id: memberships.id, userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.organizationId, context.orgId));
    return [org, rows] as const;
  });
  const members = await listMembers(context);
  const role = (await currentRole(context)) ?? "member";
  const invitations =
    role === "owner" || role === "admin" ? await listPendingInvitations(context.orgId) : [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{workspace?.name ?? t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">
          {/* The workspace was made at a moment, not on a plan date, so it
              goes through `formatDay`. Slicing the ISO string first read
              the day in UTC, which told a workspace created at half past
              midnight in Copenhagen that it was made the day before. */}
          {workspace
            ? t("createdOn", { date: formatDay(workspace.createdAt, locale) })
            : t("subtitle")}
        </p>
      </div>

      <MembersAdmin
        members={members}
        memberIds={Object.fromEntries(memberRows.map((row) => [row.userId, row.id]))}
        invitations={invitations}
        currentUserId={context.userId}
        role={role}
      />

      {role === "owner" && workspace && <DeleteWorkspaceCard workspaceName={workspace.name} />}
    </div>
  );
}
