import { randomBytes, timingSafeEqual } from "node:crypto";
import { count } from "drizzle-orm";
import { invitationAdmits } from "@/core/access/service";
import { teamInvitationAdmits } from "@/core/team/service";
import { authDb } from "@/core/db/client";
import { users } from "@/core/db/schema";
import { env } from "@/core/env";

/**
 * Who may create an account.
 *
 * An Domino on the open internet with open registration is an Domino where a
 * stranger can make themselves an organization inside your installation.
 * So registration is closed unless it is deliberately opened, and the
 * default has to be the safe one: a setting you must remember to change
 * before going live is a setting that will be forgotten.
 *
 * The exception is the empty installation. A fresh checkout with no users
 * at all lets the first person through, because otherwise nobody could
 * ever get in and every new installation would start with a chicken-and-egg
 * problem solved by hand-editing the database. The window closes by itself
 * the moment that first account exists.
 */
export type SignupMode = typeof env.SIGNUP;

/** Request-level header the registration flow uses to present its key. */
export const INVITATION_HEADER = "x-domino-invitation";

/** Header carrying a workspace invitation's id: a colleague joining an existing workspace. */
export const TEAM_INVITATION_HEADER = "x-domino-team-invitation";

export const DEMO_HEADER = "x-domino-demo";

/**
 * The demo route creates its throwaway account through the ordinary
 * sign-up endpoint, and that endpoint is public. A header alone therefore
 * proves nothing: anyone can send one, and while DEMO=on a forged
 * `x-domino-demo: 1` would have walked straight past SIGNUP=closed and
 * created permanent accounts that the demo cleanup never touches, because
 * they were never registered as demos.
 *
 * So the header carries a secret instead of a flag: a value drawn once at
 * boot, held only in this process, never written down and never sent to a
 * browser. The demo service knows it because it runs in the same process;
 * nobody outside can guess it. Compared in constant time out of habit
 * rather than need.
 */
const DEMO_NONCE = randomBytes(32).toString("base64url");

export function demoSignupHeaderValue(): string {
  return DEMO_NONCE;
}

export function isDemoSignup(value: string | null | undefined): boolean {
  if (!value) return false;
  const given = Buffer.from(value);
  const expected = Buffer.from(DEMO_NONCE);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function signupAllowedFor(mode: SignupMode, existingUsers: number): boolean {
  return mode === "open" || existingUsers === 0;
}

export async function countUsers(): Promise<number> {
  const [row] = await authDb.select({ total: count() }).from(users);
  return Number(row?.total ?? 0);
}

export type SignupAttempt = {
  /** Address the account would be created for. */
  email?: string | null;
  /** Invitation key presented with the attempt, if any. */
  invitationToken?: string | null;
  /** A workspace invitation's id, when a colleague is joining an existing workspace. */
  teamInvitationId?: string | null;
  /** The demo route creating a throwaway account for a visitor. */
  demo?: boolean;
};

/**
 * The two doors that are opened on purpose: a closed installation still
 * admits an address that holds a valid invitation from the owner (see
 * src/core/access), and an address a workspace has invited to join it
 * (see src/core/team). The key alone is never enough, the address has to
 * be the one it was issued for.
 */
export async function signupAllowed(attempt: SignupAttempt = {}): Promise<boolean> {
  // A demo account is not a person asking to be let in; it is a session
  // that expires. It is admitted only while the installation has asked
  // for demos at all.
  if (attempt.demo && env.DEMO === "on") return true;
  // Skip the count when the answer cannot depend on it.
  if (env.SIGNUP === "open") return true;
  if (signupAllowedFor(env.SIGNUP, await countUsers())) return true;
  if (attempt.invitationToken && attempt.email) {
    return invitationAdmits(attempt.invitationToken, attempt.email);
  }
  if (attempt.teamInvitationId && attempt.email) {
    return teamInvitationAdmits(attempt.teamInvitationId, attempt.email);
  }
  return false;
}
