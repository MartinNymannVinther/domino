import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAuthEvent } from "@/core/audit/events";
import { authDb } from "@/core/db/client";
import { accessInvitations, accessRequests, users } from "@/core/db/schema";
import { hashInvitationToken, invitationExpiry, invitationUrl, newInvitationToken } from "./tokens";

export { invitationState } from "./state";

/**
 * Admission: how a stranger becomes an organization on a closed installation.
 *
 * Three moving parts, in the order they happen. A person applies, which
 * stores a request and nothing else. The installation's owner approves it,
 * which mints a single-use invitation for that address. The person opens
 * the link and registers, which consumes the invitation; the signup gate
 * in src/core/auth/signup.ts is what actually asks this module whether to
 * let them through.
 *
 * Everything here runs on the auth role: these tables belong to the
 * installation, not to a tenant, and the application role cannot see them
 * at all (drizzle/0025). Framework-free, so the whole flow is testable
 * without a request.
 */

/* ------------------------------ Applying ------------------------------ */

export const AccessRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  organizationName: z.string().trim().min(1).max(200),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  /** Honeypot. Humans never see it; anything in it is a bot. */
  website: z.string().max(200).optional().or(z.literal("")),
});

export type AccessRequestInput = z.infer<typeof AccessRequestSchema>;

export type RequestMeta = { ipAddress: string | null; userAgent: string | null };

export type AccessRequestResult = { ok: true } | { ok: false; error: "invalid" | "tooMany" };

/** Applications per address per hour before the form stops listening. */
const MAX_REQUESTS_PER_IP_PER_HOUR = 5;

export async function submitAccessRequest(
  input: unknown,
  meta: RequestMeta,
): Promise<AccessRequestResult> {
  const parsed = AccessRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { name, email, organizationName, message, website } = parsed.data;

  // A filled honeypot gets the same answer as a real application and
  // leaves no trace: the point is to waste the bot's time, not ours.
  if (website) return { ok: true };

  if (meta.ipAddress) {
    const [recent] = await authDb
      .select({ total: count() })
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.ipAddress, meta.ipAddress),
          gt(accessRequests.createdAt, sql`now() - interval '1 hour'`),
        ),
      );
    if (Number(recent?.total ?? 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) {
      return { ok: false, error: "tooMany" };
    }
  }

  // One pending application per address, enforced by a partial unique
  // index. A second one is answered exactly like the first: the person
  // already did the right thing, and the answer must not reveal anything
  // about who has applied before.
  const [row] = await authDb
    .insert(accessRequests)
    .values({
      name,
      email: email.toLowerCase(),
      organizationName,
      message: message || null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    .onConflictDoNothing()
    .returning({ id: accessRequests.id });

  if (row) {
    await recordAuthEvent({
      action: "access.requested",
      entityType: "access_requests",
      entityId: row.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
  return { ok: true };
}

/* ------------------------------ The owner ------------------------------ */

/**
 * The first account on an empty installation is its owner. Everyone after
 * that is an ordinary user until someone with database access says
 * otherwise; the role is never granted from a request.
 */
export function platformRoleForNewUser(existingUsers: number): "owner" | null {
  return existingUsers === 0 ? "owner" : null;
}

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const [row] = await authDb
    .select({ role: users.platformRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role === "owner";
}

/** Throws unless the user owns the installation. */
async function requirePlatformOwner(userId: string): Promise<void> {
  if (!(await isPlatformOwner(userId))) throw new Error("NOT_PLATFORM_OWNER");
}

export async function pendingAccessRequestCount(): Promise<number> {
  const [row] = await authDb
    .select({ total: count() })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"));
  return Number(row?.total ?? 0);
}

export type AccessRequestRow = typeof accessRequests.$inferSelect;

export async function listAccessRequests(): Promise<AccessRequestRow[]> {
  // Pending first, oldest first within pending; decided ones newest first.
  return authDb
    .select()
    .from(accessRequests)
    .orderBy(
      sql`case when ${accessRequests.status} = 'pending' then 0 else 1 end`,
      sql`case when ${accessRequests.status} = 'pending' then ${accessRequests.createdAt} end asc`,
      desc(accessRequests.decidedAt),
    );
}

export type InvitationRow = typeof accessInvitations.$inferSelect;

export async function listInvitations(): Promise<InvitationRow[]> {
  return authDb.select().from(accessInvitations).orderBy(desc(accessInvitations.createdAt));
}

/* ------------------------------ Inviting ------------------------------ */

export type IssuedInvitation = { id: string; email: string; url: string; expiresAt: Date };

/**
 * Mints a fresh single-use key for an address. Any earlier open invitation
 * for the same address is revoked first, so "send a new link" is this
 * function called again and there is only ever one live key per person.
 * The plain token is returned once, here, and never stored.
 */
export async function createInvitation(
  actorUserId: string,
  input: { email: string; organizationName: string; accessRequestId?: string | null },
): Promise<IssuedInvitation> {
  await requirePlatformOwner(actorUserId);
  const email = input.email.trim().toLowerCase();
  const organizationName = input.organizationName.trim();
  if (!email || !organizationName) throw new Error("INVALID");

  const { token, hash } = newInvitationToken();
  const expiresAt = invitationExpiry();

  const created = await authDb.transaction(async (tx) => {
    await tx
      .update(accessInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          sql`lower(${accessInvitations.email}) = ${email}`,
          isNull(accessInvitations.usedAt),
          isNull(accessInvitations.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(accessInvitations)
      .values({
        email,
        organizationName,
        tokenHash: hash,
        invitedBy: actorUserId,
        accessRequestId: input.accessRequestId ?? null,
        expiresAt,
      })
      .returning({ id: accessInvitations.id });
    return row!;
  });

  await recordAuthEvent({
    action: "invitation.created",
    actorUserId,
    entityType: "access_invitations",
    entityId: created.id,
  });

  return { id: created.id, email, url: invitationUrl(token), expiresAt };
}

/** Approves an application: marks it, and hands back the link to send. */
export async function approveAccessRequest(
  actorUserId: string,
  requestId: string,
): Promise<IssuedInvitation> {
  await requirePlatformOwner(actorUserId);
  const [request] = await authDb
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, requestId))
    .limit(1);
  if (!request) throw new Error("NOT_FOUND");

  const invitation = await createInvitation(actorUserId, {
    email: request.email,
    organizationName: request.organizationName,
    accessRequestId: request.id,
  });

  if (request.status === "pending") {
    await authDb
      .update(accessRequests)
      .set({ status: "approved", decidedAt: new Date(), decidedBy: actorUserId })
      .where(eq(accessRequests.id, requestId));
    await recordAuthEvent({
      action: "access.approved",
      actorUserId,
      entityType: "access_requests",
      entityId: request.id,
    });
  }
  return invitation;
}

export async function declineAccessRequest(actorUserId: string, requestId: string): Promise<void> {
  await requirePlatformOwner(actorUserId);
  const [row] = await authDb
    .update(accessRequests)
    .set({ status: "declined", decidedAt: new Date(), decidedBy: actorUserId })
    .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")))
    .returning({ id: accessRequests.id });
  if (!row) throw new Error("NOT_FOUND");
  await recordAuthEvent({
    action: "access.declined",
    actorUserId,
    entityType: "access_requests",
    entityId: row.id,
  });
}

/* ------------------------------ Admitting ------------------------------ */

export type ValidInvitation = { id: string; email: string; organizationName: string };

/** The invitation behind a token, if it can still be used. */
export async function findValidInvitation(token: string): Promise<ValidInvitation | null> {
  if (!token) return null;
  const [row] = await authDb
    .select({
      id: accessInvitations.id,
      email: accessInvitations.email,
      organizationName: accessInvitations.organizationName,
    })
    .from(accessInvitations)
    .where(
      and(
        eq(accessInvitations.tokenHash, hashInvitationToken(token)),
        isNull(accessInvitations.usedAt),
        isNull(accessInvitations.revokedAt),
        gt(accessInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Does this token admit this address? The address is part of the check
 * on purpose: a key is for one person, and a leaked link must not let
 * someone else register under a different e-mail.
 */
export async function invitationAdmits(token: string | null | undefined, email: string) {
  if (!token) return false;
  const invitation = await findValidInvitation(token);
  return invitation !== null && invitation.email === email.trim().toLowerCase();
}

/** Burns the key the moment the account exists. */
export async function consumeInvitation(token: string, userId: string): Promise<void> {
  const [row] = await authDb
    .update(accessInvitations)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(
      and(
        eq(accessInvitations.tokenHash, hashInvitationToken(token)),
        isNull(accessInvitations.usedAt),
      ),
    )
    .returning({ id: accessInvitations.id });
  if (!row) return;
  await recordAuthEvent({
    action: "invitation.used",
    actorUserId: userId,
    entityType: "access_invitations",
    entityId: row.id,
  });
}
