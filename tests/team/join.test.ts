import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { auth } from "@/core/auth/auth";
import { registerUserWithOrganization } from "@/core/auth/register";
import { signupAllowed } from "@/core/auth/signup";
import { env } from "@/core/env";
import { registerInvited } from "@/core/team/register";
import {
  acceptTeamInvitation,
  cancelInvitation,
  findTeamInvitation,
  inviteMember,
  listPendingInvitations,
  removeMember,
  teamInvitationAdmits,
  updateMemberRole,
} from "@/core/team/service";
import { adminPool } from "../helpers/db";

/**
 * A colleague joining a workspace, end to end against the real Better
 * Auth instance: the owner invites, the link admits exactly that address
 * through the closed signup, the new account lands in the existing
 * workspace rather than a new one, and an existing account can accept
 * too. Roles and removal go through the plugin's own permission checks.
 */

const PASSWORD = "en-meget-lang-kode-123";
let admin: Pool;
let ownerHeaders: Headers;
let orgId: string;

function cookieHeaderFrom(responseHeaders: Headers): Headers {
  const cookie = responseHeaders
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return new Headers({ cookie });
}

async function signIn(email: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return cookieHeaderFrom(headers);
}

beforeAll(async () => {
  admin = adminPool();
  const result = await registerUserWithOrganization(new Headers(), {
    name: "Ejer",
    email: "team-owner@example.com",
    password: PASSWORD,
    organizationName: "Teamfirma",
  });
  expect(result).toEqual({ ok: true });
  ownerHeaders = await signIn("team-owner@example.com");
  const org = await admin.query("select id from organizations where name = 'Teamfirma'");
  orgId = org.rows[0].id;
});

afterAll(async () => {
  await admin.end();
});

describe("inviting a colleague", () => {
  let invitationId: string;

  it("issues a link for the address, visible on the members page", async () => {
    const result = await inviteMember(ownerHeaders, {
      email: "Kollega@Example.com",
      role: "member",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    invitationId = result.invitation.id;
    expect(result.invitation.email).toBe("kollega@example.com");
    expect(result.invitation.url).toBe(`http://localhost:3000/join/${invitationId}`);
    const pending = await listPendingInvitations(orgId);
    expect(pending.map((i) => i.email)).toEqual(["kollega@example.com"]);
    const view = await findTeamInvitation(invitationId);
    expect(view).toMatchObject({
      workspaceName: "Teamfirma",
      inviterName: "Ejer",
      state: "pending",
    });
  });

  it("refuses a second invitation for the same address", async () => {
    const again = await inviteMember(ownerHeaders, {
      email: "kollega@example.com",
      role: "member",
    });
    expect(again).toEqual({ ok: false, error: "alreadyInvited" });
  });

  it("opens the closed signup for that address and no other", async () => {
    // The suite runs with SIGNUP=open; the gate is closed here by hand.
    const gate = env as { SIGNUP: "open" | "closed" };
    gate.SIGNUP = "closed";
    try {
      expect(await teamInvitationAdmits(invitationId, "kollega@example.com")).toBe(true);
      expect(await teamInvitationAdmits(invitationId, "someone-else@example.com")).toBe(false);
      expect(
        await signupAllowed({ email: "kollega@example.com", teamInvitationId: invitationId }),
      ).toBe(true);
      expect(await signupAllowed({ email: "kollega@example.com" })).toBe(false);
    } finally {
      gate.SIGNUP = "open";
    }
  });

  it("registers the colleague straight into the existing workspace", async () => {
    const result = await registerInvited(new Headers(), {
      invitationId,
      name: "Kollega",
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
    const user = await admin.query("select id from users where email = 'kollega@example.com'");
    const memberships = await admin.query(
      "select organization_id, role from memberships where user_id = $1",
      [user.rows[0].id],
    );
    expect(memberships.rows).toEqual([{ organization_id: orgId, role: "member" }]);
    const session = await admin.query(
      "select active_organization_id from sessions where user_id = $1 order by created_at desc limit 1",
      [user.rows[0].id],
    );
    expect(session.rows[0].active_organization_id).toBe(orgId);
    expect((await findTeamInvitation(invitationId))?.state).toBe("accepted");
  });

  it("does not let the used link register anybody again", async () => {
    const result = await registerInvited(new Headers(), {
      invitationId,
      name: "Igen",
      password: PASSWORD,
    });
    expect(result).toMatchObject({ ok: false, error: "invitationInvalid" });
  });

  it("lets an existing account accept, but only the one the invitation names", async () => {
    await registerUserWithOrganization(new Headers(), {
      name: "Ekstern",
      email: "ekstern@example.com",
      password: PASSWORD,
      organizationName: "Eksternfirma",
    });
    const invite = await inviteMember(ownerHeaders, {
      email: "ekstern@example.com",
      role: "admin",
    });
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;
    const stranger = await signIn("kollega@example.com");
    expect(await acceptTeamInvitation(stranger, invite.invitation.id)).toBe("wrongPerson");
    const ekstern = await signIn("ekstern@example.com");
    expect(await acceptTeamInvitation(ekstern, invite.invitation.id)).toBe("accepted");
    const rows = await admin.query(
      `select m.role from memberships m join users u on u.id = m.user_id
       where u.email = 'ekstern@example.com' and m.organization_id = $1`,
      [orgId],
    );
    expect(rows.rows).toEqual([{ role: "admin" }]);
  });

  it("lets a member be demoted, promoted and removed by the owner, not by a member", async () => {
    const member = await admin.query(
      `select m.id from memberships m join users u on u.id = m.user_id
       where u.email = 'kollega@example.com' and m.organization_id = $1`,
      [orgId],
    );
    const memberId = member.rows[0].id as string;
    const memberHeaders = await signIn("kollega@example.com");
    expect(await updateMemberRole(memberHeaders, memberId, "admin")).toBe(false);
    expect(await updateMemberRole(ownerHeaders, memberId, "admin")).toBe(true);
    expect(await updateMemberRole(ownerHeaders, memberId, "member")).toBe(true);
    const invite = await inviteMember(ownerHeaders, {
      email: "tredje@example.com",
      role: "member",
    });
    expect(invite.ok).toBe(true);
    if (invite.ok) expect(await cancelInvitation(ownerHeaders, invite.invitation.id)).toBe(true);
    expect(await removeMember(memberHeaders, "ekstern@example.com")).toBe(false);
    expect(await removeMember(ownerHeaders, "kollega@example.com")).toBe(true);
    const left = await admin.query(
      `select count(*)::int as n from memberships where organization_id = $1`,
      [orgId],
    );
    expect(left.rows[0].n).toBe(2);
  });
});
