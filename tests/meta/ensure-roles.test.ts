import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureRole } from "../../scripts/ensure-roles";

/**
 * The roles the application logs in as have to be able to log in.
 *
 * That sounds too obvious to test until it has cost you an evening: on the
 * first real deployment the roles existed, owned nothing, and were NOLOGIN,
 * so the app was refused by its own database and the only symptom was a
 * health check answering 503 with an empty log.
 *
 * Run against a throwaway role rather than domino_app, because changing the
 * password of the role every other suite connects with would be a cure
 * worse than the disease.
 */

const ROLE = "domino_probe_role";
const PASSWORD = "en-kode-med-'apostrof-og-\\backslash";

function migrationUrl(): string {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");
  return url;
}

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: migrationUrl() });
  await client.connect();
  await client.query(`drop role if exists ${ROLE}`);
});

afterAll(async () => {
  await client?.query(`drop role if exists ${ROLE}`);
  await client?.end();
});

async function state() {
  const { rows } = await client.query<{ rolcanlogin: boolean }>(
    "select rolcanlogin from pg_roles where rolname = $1",
    [ROLE],
  );
  return rows[0];
}

describe("ensureRole", () => {
  it("creates a role that can log in", async () => {
    expect(await state()).toBeUndefined();
    await ensureRole(client, ROLE, PASSWORD);
    expect((await state())?.rolcanlogin).toBe(true);
  });

  it("is idempotent, and repairs a role that lost its login right", async () => {
    await client.query(`alter role ${ROLE} nologin`);
    expect((await state())?.rolcanlogin).toBe(false);

    await ensureRole(client, ROLE, PASSWORD);
    expect((await state())?.rolcanlogin).toBe(true);
  });

  it("survives a password full of characters that break naive quoting", async () => {
    await ensureRole(client, ROLE, PASSWORD);

    // Proven by using it: the password is only correct if a login works.
    const url = new URL(migrationUrl());
    url.username = ROLE;
    url.password = PASSWORD;
    const probe = new Client({ connectionString: url.toString() });
    await probe.connect();
    const { rows } = await probe.query<{ me: string }>("select current_user as me");
    await probe.end();
    expect(rows[0]?.me).toBe(ROLE);
  });
});
