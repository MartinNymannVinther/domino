import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isPlatformOwner, listAccessRequests, listInvitations } from "@/core/access/service";
import { getSession } from "@/core/auth/session";
import { AccessAdmin } from "./access-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.access");
  return { title: t("title") };
}

/**
 * The owner's side of admission. Anyone else gets a 404 rather than a
 * "not allowed": the page's existence is not something a member of some
 * organization needs to know about.
 */
export default async function AccessPage() {
  const session = await getSession();
  if (!session || !(await isPlatformOwner(session.user.id))) notFound();

  const t = await getTranslations("settings.access");
  const [requests, invitations] = await Promise.all([listAccessRequests(), listInvitations()]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>
      <AccessAdmin
        requests={requests.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          organizationName: r.organizationName,
          message: r.message,
          status: r.status as "pending" | "approved" | "declined",
          createdAt: r.createdAt,
          decidedAt: r.decidedAt,
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          organizationName: i.organizationName,
          expiresAt: i.expiresAt,
          usedAt: i.usedAt,
          revokedAt: i.revokedAt,
          createdAt: i.createdAt,
        }))}
      />
    </div>
  );
}
