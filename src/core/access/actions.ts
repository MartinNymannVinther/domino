"use server";

import { headers } from "next/headers";
import { getSession } from "@/core/auth/session";
import { clientAddress } from "@/core/rate-limit";
import {
  approveAccessRequest,
  createInvitation,
  declineAccessRequest,
  isPlatformOwner,
  submitAccessRequest,
  type AccessRequestResult,
  type IssuedInvitation,
} from "./service";

export type { AccessRequestResult };

/** Public: anyone may ask for access. */
export async function requestAccessAction(input: unknown): Promise<AccessRequestResult> {
  const h = await headers();
  return submitAccessRequest(input, {
    ipAddress: clientAddress(h),
    userAgent: h.get("user-agent"),
  });
}

/* --- Owner only. Each action resolves the caller itself and answers a --- */
/* --- generic failure to anyone else; nothing about the queue leaks.   --- */

export type OwnerActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: "unauthorized" | "invalid" | "generic" };

async function ownerUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return (await isPlatformOwner(session.user.id)) ? session.user.id : null;
}

export type IssuedLink = { url: string; email: string; expiresAt: string };

function issued(invitation: IssuedInvitation): IssuedLink {
  return {
    url: invitation.url,
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function approveAccessRequestAction(
  requestId: string,
): Promise<OwnerActionResult<IssuedLink>> {
  const actor = await ownerUserId();
  if (!actor) return { ok: false, error: "unauthorized" };
  try {
    return { ok: true, data: issued(await approveAccessRequest(actor, String(requestId))) };
  } catch (error) {
    console.error("access: approve failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function declineAccessRequestAction(requestId: string): Promise<OwnerActionResult> {
  const actor = await ownerUserId();
  if (!actor) return { ok: false, error: "unauthorized" };
  try {
    await declineAccessRequest(actor, String(requestId));
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("access: decline failed", error);
    return { ok: false, error: "generic" };
  }
}

export async function createInvitationAction(input: {
  email: string;
  organizationName: string;
}): Promise<OwnerActionResult<IssuedLink>> {
  const actor = await ownerUserId();
  if (!actor) return { ok: false, error: "unauthorized" };
  const email = String(input?.email ?? "").trim();
  const organizationName = String(input?.organizationName ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !organizationName) {
    return { ok: false, error: "invalid" };
  }
  try {
    return { ok: true, data: issued(await createInvitation(actor, { email, organizationName })) };
  } catch (error) {
    console.error("access: invite failed", error);
    return { ok: false, error: "generic" };
  }
}
