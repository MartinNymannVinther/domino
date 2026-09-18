import { cache } from "react";
import { getSession } from "@/core/auth/session";
import { isPlatformOwner, pendingAccessRequestCount } from "./service";

/**
 * For the navigation: is the current user the installation's owner, and
 * if so, how many applications wait. Null for everyone else, so a page
 * can render "nothing" without knowing why. Cached per request because
 * the sidebar and the settings navigation both ask.
 */
export const ownerAccessSummary = cache(async (): Promise<{ pending: number } | null> => {
  const session = await getSession();
  if (!session) return null;
  if (!(await isPlatformOwner(session.user.id))) return null;
  return { pending: await pendingAccessRequestCount() };
});
