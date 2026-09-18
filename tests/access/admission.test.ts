import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client, Pool } from "pg";
import {
  approveAccessRequest,
  createInvitation,
  declineAccessRequest,
  findValidInvitation,
  invitationAdmits,
  isPlatformOwner,
  pendingAccessRequestCount,
  platformRoleForNewUser,
  submitAccessRequest,
} from "@/core/access/service";
import { invitationState } from "@/core/access/state";
import { hashInvitationToken } from "@/core/access/tokens";
import { registerUserWithOrganization } from "@/core/auth/register";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Admission is the second door into a closed installation, next to the
 * "first user" exception, so the questions here are the hostile ones: can
 * a key be used twice, by someone else, after it expired, or after a newer
 * one was issued; can anyone but the owner mint one; and can application
 * code that runs as the tenant role even see these tables.
 *
 * The suite runs with SIGNUP=open (see vitest.config.mts), so the closed
 * gate is exercised by loading the gate against a closed environment.
 */

const OWNER = "user_admission_owner";
const MEMBER = "user_admission_member";
const META = { ipAddress: "203.0.113.7", userAgent: "vitest" };
const PASSWORD = "en-meget-lang-kode-123";

let admin: Pool;
let app: Client;

function tokenOf(url: string): string {
  return new URL(url).searchParams.get("invitation")!;
}

async function requestFor(email: string, name = "Ansøger") {
  const result = await submitAccessRequest(
    { name, email, organizationName: `${name} ApS`, message: "Hej" },
    META,
  );
  expect(result).toEqual({ ok: true });
  const { rows } = await admin.query("select id from access_requests where email = $1", [email]);
  return rows[0]!.id as string;
}

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  await admin.query(
    `insert into users (id, name, email, platform_role) values
       ($1, 'Installationsejer', 'admission-owner@example.com', 'owner'),
       ($2, 'Almindeligt Medlem', 'admission-member@example.com', null)`,
    [OWNER, MEMBER],
  );
});

afterAll(async () => {
  await admin.query("delete from access_invitations");
  await admin.query("delete from access_requests");
  await admin.query(
    `delete from organizations where id in (
       select organization_id from memberships m join users u on u.id = m.user_id
       where u.email like '%@admission.example')`,
  );
  await admin.query("delete from users where email like '%@admission.example'");
  await admin.query("delete from users where id = any($1)", [[OWNER, MEMBER]]);
  await app?.end();
  await admin?.end();
});

describe("the installation's owner", () => {
  it("is the first account on an empty installation, and nobody after", () => {
    expect(platformRoleForNewUser(0)).toBe("owner");
    expect(platformRoleForNewUser(1)).toBeNull();
    expect(platformRoleForNewUser(500)).toBeNull();
  });

  it("is read from the database, not from the request", async () => {
    expect(await isPlatformOwner(OWNER)).toBe(true);
    expect(await isPlatformOwner(MEMBER)).toBe(false);
    expect(await isPlatformOwner("user_does_not_exist")).toBe(false);
  });
});

describe("the tables are out of the tenant role's reach", () => {
  it("refuses the application role, with or without an org context", async () => {
    for (const table of ["access_requests", "access_invitations"]) {
      expect(await expectSqlError(asApp(app, null, (c) => c.query(`select * from ${table}`)))).toBe(
        "42501",
      );
      expect(
        await expectSqlError(
          asApp(app, { orgId: "org_x", userId: OWNER }, (c) => c.query(`select * from ${table}`)),
        ),
      ).toBe("42501");
    }
  });
});

describe("applying", () => {
  it("stores one pending request and records it", async () => {
    const id = await requestFor("ansoeger@admission.example", "Første");
    const { rows } = await admin.query(
      "select status, ip_address, message from access_requests where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({
      status: "pending",
      ip_address: META.ipAddress,
      message: "Hej",
    });
    const events = await admin.query(
      "select actor_type from audit_log where action = 'access.requested' and entity_id = $1",
      [id],
    );
    expect(events.rowCount).toBe(1);
    expect(events.rows[0].actor_type).toBe("system");
  });

  it("answers a second application from the same address exactly like the first, and stores nothing", async () => {
    const before = await pendingAccessRequestCount();
    const again = await submitAccessRequest(
      { name: "Første Igen", email: "ANSOEGER@admission.example", organizationName: "X" },
      META,
    );
    expect(again).toEqual({ ok: true });
    expect(await pendingAccessRequestCount()).toBe(before);
  });

  it("drops a filled honeypot without a trace", async () => {
    const before = await pendingAccessRequestCount();
    const bot = await submitAccessRequest(
      {
        name: "Bot",
        email: "bot@admission.example",
        organizationName: "Bots",
        website: "http://x",
      },
      META,
    );
    expect(bot).toEqual({ ok: true });
    expect(await pendingAccessRequestCount()).toBe(before);
  });

  it("rejects garbage instead of storing it", async () => {
    expect(
      await submitAccessRequest({ name: "", email: "nope", organizationName: "" }, META),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("stops listening to an address that applies too often", async () => {
    const ip = { ipAddress: "198.51.100.9", userAgent: "vitest" };
    for (let i = 0; i < 5; i += 1) {
      expect(
        await submitAccessRequest(
          { name: `Ivrig ${i}`, email: `ivrig-${i}@admission.example`, organizationName: "Ivrig" },
          ip,
        ),
      ).toEqual({ ok: true });
    }
    expect(
      await submitAccessRequest(
        { name: "Ivrig 6", email: "ivrig-6@admission.example", organizationName: "Ivrig" },
        ip,
      ),
    ).toEqual({ ok: false, error: "tooMany" });
  });
});

describe("deciding", () => {
  it("is for the owner only", async () => {
    const id = await requestFor("afvist-af-medlem@admission.example", "Medlemsforsøg");
    await expect(approveAccessRequest(MEMBER, id)).rejects.toThrow("NOT_PLATFORM_OWNER");
    await expect(declineAccessRequest(MEMBER, id)).rejects.toThrow("NOT_PLATFORM_OWNER");
    await expect(
      createInvitation(MEMBER, { email: "x@admission.example", organizationName: "X" }),
    ).rejects.toThrow("NOT_PLATFORM_OWNER");
    const { rows } = await admin.query("select status from access_requests where id = $1", [id]);
    expect(rows[0].status).toBe("pending");
  });

  it("declining closes the request and records who did it", async () => {
    const id = await requestFor("afvist@admission.example", "Afvist");
    await declineAccessRequest(OWNER, id);
    const { rows } = await admin.query(
      "select status, decided_by from access_requests where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({ status: "declined", decided_by: OWNER });
    await expect(declineAccessRequest(OWNER, id)).rejects.toThrow("NOT_FOUND");
    const events = await admin.query(
      "select actor_user_id from audit_log where action = 'access.declined' and entity_id = $1",
      [id],
    );
    expect(events.rows[0]?.actor_user_id).toBe(OWNER);
  });

  it("approving mints a key for that address and stores only its hash", async () => {
    const id = await requestFor("godkendt@admission.example", "Godkendt");
    const issued = await approveAccessRequest(OWNER, id);
    expect(issued.email).toBe("godkendt@admission.example");
    const token = tokenOf(issued.url);
    expect(token.length).toBeGreaterThan(30);

    const { rows } = await admin.query(
      "select token_hash, access_request_id, invited_by from access_invitations where id = $1",
      [issued.id],
    );
    expect(rows[0].token_hash).toBe(hashInvitationToken(token));
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0]).toMatchObject({ access_request_id: id, invited_by: OWNER });

    const request = await admin.query("select status from access_requests where id = $1", [id]);
    expect(request.rows[0].status).toBe("approved");
  });
});

describe("a key", () => {
  it("admits its own address and nobody else's", async () => {
    const issued = await createInvitation(OWNER, {
      email: "Noegle@admission.example",
      organizationName: "Nøgle ApS",
    });
    const token = tokenOf(issued.url);
    expect(await invitationAdmits(token, "noegle@admission.example")).toBe(true);
    expect(await invitationAdmits(token, "  NOEGLE@admission.example ")).toBe(true);
    expect(await invitationAdmits(token, "anden@admission.example")).toBe(false);
    expect(await invitationAdmits("ikke-en-noegle", "noegle@admission.example")).toBe(false);
    expect(await invitationAdmits(null, "noegle@admission.example")).toBe(false);
  });

  it("dies when a newer one is issued for the same address", async () => {
    const first = await createInvitation(OWNER, {
      email: "ny@admission.example",
      organizationName: "Ny",
    });
    const second = await createInvitation(OWNER, {
      email: "ny@admission.example",
      organizationName: "Ny",
    });
    expect(await findValidInvitation(tokenOf(first.url))).toBeNull();
    expect(await findValidInvitation(tokenOf(second.url))).not.toBeNull();
  });

  it("dies when it expires", async () => {
    const issued = await createInvitation(OWNER, {
      email: "sen@admission.example",
      organizationName: "Sen",
    });
    await admin.query(
      "update access_invitations set expires_at = now() - interval '1 minute' where id = $1",
      [issued.id],
    );
    expect(await findValidInvitation(tokenOf(issued.url))).toBeNull();
  });

  it("opens a closed installation for exactly that address", async () => {
    const issued = await createInvitation(OWNER, {
      email: "lukket@admission.example",
      organizationName: "Lukket",
    });
    const token = tokenOf(issued.url);

    vi.doMock("@/core/env", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/core/env")>();
      return { ...actual, env: { ...actual.env, SIGNUP: "closed" } };
    });
    vi.resetModules();
    const { signupAllowed } = await import("@/core/auth/signup");
    try {
      expect(await signupAllowed()).toBe(false);
      expect(await signupAllowed({ email: "lukket@admission.example" })).toBe(false);
      expect(
        await signupAllowed({ email: "anden@admission.example", invitationToken: token }),
      ).toBe(false);
      expect(
        await signupAllowed({ email: "lukket@admission.example", invitationToken: token }),
      ).toBe(true);
    } finally {
      vi.doUnmock("@/core/env");
      vi.resetModules();
    }
  });
});

describe("registering with a key", () => {
  it("creates the account for the invited address and organization, then burns the key", async () => {
    const issued = await createInvitation(OWNER, {
      email: "inviteret@admission.example",
      organizationName: "Inviteret Rådgivning",
    });
    const token = tokenOf(issued.url);

    // The form says something else; the invitation decides.
    const result = await registerUserWithOrganization(new Headers(), {
      name: "Inviteret Person",
      email: "forsoeg-paa-anden@admission.example",
      organizationName: "Forkert Navn",
      password: PASSWORD,
      invitationToken: token,
    });
    expect(result).toEqual({ ok: true });

    const user = await admin.query("select id, platform_role from users where email = $1", [
      "inviteret@admission.example",
    ]);
    expect(user.rowCount).toBe(1);
    expect(user.rows[0].platform_role).toBeNull();
    const wrong = await admin.query("select 1 from users where email = $1", [
      "forsoeg-paa-anden@admission.example",
    ]);
    expect(wrong.rowCount).toBe(0);

    const org = await admin.query(
      `select o.name from organizations o join memberships m on m.organization_id = o.id
       where m.user_id = $1`,
      [user.rows[0].id],
    );
    expect(org.rows[0].name).toBe("Inviteret Rådgivning");

    const invitation = await admin.query(
      "select used_at, used_by_user_id from access_invitations where id = $1",
      [issued.id],
    );
    expect(invitation.rows[0].used_at).not.toBeNull();
    expect(invitation.rows[0].used_by_user_id).toBe(user.rows[0].id);
    const events = await admin.query(
      "select actor_user_id from audit_log where action = 'invitation.used' and entity_id = $1",
      [issued.id],
    );
    expect(events.rows[0]?.actor_user_id).toBe(user.rows[0].id);

    // Spent: the same link a second time is refused as a dead key.
    const again = await registerUserWithOrganization(new Headers(), {
      name: "Igen",
      email: "inviteret@admission.example",
      organizationName: "Igen",
      password: PASSWORD,
      invitationToken: token,
    });
    expect(again).toEqual({ ok: false, error: "invitationInvalid" });
  });

  it("tells a dead key apart from a closed door", async () => {
    const result = await registerUserWithOrganization(new Headers(), {
      name: "Nogen",
      email: "nogen@admission.example",
      organizationName: "Nogen",
      password: PASSWORD,
      invitationToken: "ikke-en-noegle",
    });
    expect(result).toEqual({ ok: false, error: "invitationInvalid" });
  });
});

describe("what a stored key is right now", () => {
  const soon = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  it("reads used, then revoked, then expired, then open", () => {
    expect(invitationState({ usedAt: past, revokedAt: past, expiresAt: past })).toBe("used");
    expect(invitationState({ usedAt: null, revokedAt: past, expiresAt: past })).toBe("revoked");
    expect(invitationState({ usedAt: null, revokedAt: null, expiresAt: past })).toBe("expired");
    expect(invitationState({ usedAt: null, revokedAt: null, expiresAt: soon })).toBe("open");
  });
});
