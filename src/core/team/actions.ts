"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { getSession } from "@/core/auth/session";
import { fail, ok, type Result } from "@/core/result";
import { registerInvited, type JoinRegisterResult } from "./register";
import {
  acceptTeamInvitation,
  cancelInvitation,
  inviteMember,
  leaveWorkspace,
  removeMember,
  updateMemberRole,
  type AcceptResult,
  type InviteError,
  type IssuedTeamInvitation,
} from "./service";

/**
 * The team's server actions. Every one resolves the caller's session and
 * hands Better Auth the request headers, so the plugin's own permission
 * checks — who may invite, who may remove — are the ones that decide.
 * The members page refreshes afterwards.
 */

const MEMBERS_PATH = "/settings/workspace";

export async function inviteMemberAction(
  raw: unknown,
): Promise<Result<IssuedTeamInvitation> | { ok: false; error: InviteError }> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const result = await inviteMember(await headers(), raw);
  if (!result.ok) return result;
  revalidatePath(MEMBERS_PATH);
  return ok(result.invitation);
}

export async function cancelInvitationAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ invitationId: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await cancelInvitation(await headers(), parsed.data.invitationId);
  revalidatePath(MEMBERS_PATH);
  return done ? ok(true) : fail("generic");
}

export async function removeMemberAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ memberId: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await removeMember(await headers(), parsed.data.memberId);
  revalidatePath(MEMBERS_PATH);
  return done ? ok(true) : fail("generic");
}

export async function updateMemberRoleAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({ memberId: z.string().min(1).max(200), role: z.enum(["admin", "member"]) })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await updateMemberRole(await headers(), parsed.data.memberId, parsed.data.role);
  revalidatePath(MEMBERS_PATH);
  return done ? ok(true) : fail("generic");
}

export async function leaveWorkspaceAction(): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const done = await leaveWorkspace(await headers(), ctx.orgId);
  return done ? ok(true) : fail("generic");
}

/** A signed-in person accepting the invitation they were sent. */
export async function acceptInvitationAction(raw: unknown): Promise<AcceptResult | "unauthorized"> {
  const session = await getSession();
  if (!session) return "unauthorized";
  const parsed = z.object({ invitationId: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) return "invalid";
  return acceptTeamInvitation(await headers(), parsed.data.invitationId);
}

/** A new person registering through the invitation; the session cookie is set by Better Auth. */
export async function joinRegisterAction(raw: unknown): Promise<JoinRegisterResult> {
  const result = await registerInvited(await headers(), raw);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
