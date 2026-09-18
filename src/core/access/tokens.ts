import { createHash, randomBytes } from "node:crypto";
import { env } from "@/core/env";

/**
 * Invitation keys.
 *
 * The key travels in a link and is stored only as a hash, the same way an
 * API key is. It admits one address to register one account while signup
 * is otherwise closed; that is the whole privilege, so a leaked database
 * hands nobody a way in and a leaked link is dead the moment it is used.
 */

/** Seven days: long enough to be found in an inbox, short enough to forget. */
export const INVITATION_TTL_DAYS = 7;

export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The registration link, on the installation's own public address. */
export function invitationUrl(token: string): string {
  const url = new URL("/register", env.BETTER_AUTH_URL);
  url.searchParams.set("invitation", token);
  return url.toString();
}

export function invitationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
