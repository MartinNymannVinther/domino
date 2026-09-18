import { APIError } from "better-auth";
import { z } from "zod";
import { auth } from "@/core/auth/auth";
import { DEMO_HEADER, INVITATION_HEADER, TEAM_INVITATION_HEADER } from "@/core/auth/signup";
import { acceptTeamInvitation, findTeamInvitation } from "./service";

export const JoinRegisterSchema = z.object({
  invitationId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  password: z.string().min(12).max(128),
});

export type JoinRegisterResult =
  { ok: true } | { ok: false; error: "invalid" | "emailExists" | "invitationInvalid" | "generic" };

/** Turns the set-cookie headers of an API response into a cookie header. */
function cookieHeaderFrom(responseHeaders: Headers): Headers {
  const cookie = responseHeaders
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return new Headers({ cookie });
}

/**
 * A colleague without an account joins the workspace that invited them:
 * the account is created for the invitation's address — never for one
 * the form typed — and the invitation is accepted with the fresh session,
 * which makes the workspace their active one. No workspace of their own
 * is created; they came to join one.
 *
 * Framework-free, like the ordinary registration, so it is testable
 * without a request. The set-cookie pairs of the sign-up are what the
 * caller hands on to the browser.
 */
export async function registerInvited(
  requestHeaders: Headers,
  input: unknown,
): Promise<JoinRegisterResult & { sessionHeaders?: Headers }> {
  const parsed = JoinRegisterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { invitationId, name, password } = parsed.data;

  const invitation = await findTeamInvitation(invitationId);
  if (!invitation || invitation.state !== "pending")
    return { ok: false, error: "invitationInvalid" };

  const signUpHeaders = new Headers(requestHeaders);
  signUpHeaders.delete(INVITATION_HEADER);
  signUpHeaders.delete(TEAM_INVITATION_HEADER);
  signUpHeaders.delete(DEMO_HEADER);
  signUpHeaders.set(TEAM_INVITATION_HEADER, invitationId);

  let sessionHeaders: Headers;
  try {
    const { headers: responseHeaders } = await auth.api.signUpEmail({
      body: { name, email: invitation.email, password },
      headers: signUpHeaders,
      returnHeaders: true,
    });
    sessionHeaders = cookieHeaderFrom(responseHeaders);
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "USER_ALREADY_EXISTS") {
      return { ok: false, error: "emailExists" };
    }
    console.error("join: sign-up failed", error);
    return { ok: false, error: "generic" };
  }

  const accepted = await acceptTeamInvitation(sessionHeaders, invitationId);
  if (accepted !== "accepted") {
    // The account exists and is signed in; without a workspace the app
    // sends them to onboarding, where they can create one or ask for a
    // new link.
    console.error("join: account created but the invitation was not accepted:", accepted);
    return { ok: false, error: "invitationInvalid", sessionHeaders };
  }
  return { ok: true, sessionHeaders };
}
