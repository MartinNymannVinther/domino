import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Pool } from "pg";
import { EnvSchema } from "@/core/env";
import { withOrgContext } from "@/core/db/tenant";
import type { LlmProvider } from "@/core/llm";
import {
  MAX_CALLS_PER_INSTALLATION_PER_DAY,
  MAX_CALLS_PER_USER_PER_HOUR,
  MAX_CALLS_PER_WORKSPACE_PER_DAY,
  RateLimited,
  reserveAiCall,
} from "@/modules/ai/limits";
import { adminPool, appClient, asApp } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * The three ceilings on the AI surface (docs/adr/0035), proven against a
 * real database because the middle of the argument is an RLS policy.
 *
 * Two of them are counted inside a tenant context and answer for one
 * workspace. The third is the installation's own roof: it has to see a
 * count that spans every workspace, and it must do so without the
 * application role ever seeing a row it does not own. Both halves of that
 * are asserted here, and so is the thing the roof exists for — that the
 * refusal happens before the model is asked, not after it has answered.
 */

const spy = vi.hoisted(() => ({
  provider: null as LlmProvider | null,
}));

vi.mock("@/modules/ai/model-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ai/model-settings")>()),
  workspaceLlmProvider: async () => spy.provider,
}));

let admin: Pool;
let app: Client;
/** Workspace A is the one that spends; B is the innocent bystander. */
let A: { orgId: string; userId: string };
let B: { orgId: string; userId: string };
/** A colleague in A, so "per user" can be told apart from "per workspace". */
let colleague: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  A = await seedWorkspace(admin, "ailimit_a");
  B = await seedWorkspace(admin, "ailimit_b");
  colleague = await seedMember(admin, A.orgId, "ailimit_colleague");
});

afterAll(async () => {
  // Every later suite shares this installation's roof. Leave it clear.
  await admin?.query("delete from ai_calls");
  await app?.end();
  await admin?.end();
});

beforeEach(async () => {
  await admin.query("delete from ai_calls");
  spy.provider = null;
});

/**
 * Rows straight into the counter. `user_id` may be null, which is how a
 * workspace is filled up without any one person being over their own
 * hour, and `age` puts rows outside the window the ceilings read.
 */
async function record(
  orgId: string,
  userId: string | null,
  n: number,
  age = "0 seconds",
): Promise<void> {
  if (n <= 0) return;
  await admin.query(
    `insert into ai_calls (org_id, user_id, kind, engine, created_at)
     select $1, $2, 'test', 'test', now() - $4::interval from generate_series(1, $3)`,
    [orgId, userId, n, age],
  );
}

function reserve(ctx: { orgId: string; userId: string }): Promise<void> {
  return withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, "test", "test"));
}

async function counted(): Promise<number> {
  const { rows } = await admin.query<{ n: number }>("select count(*)::int as n from ai_calls");
  return rows[0]?.n ?? -1;
}

describe("the ceilings a workspace sets for itself", () => {
  it("refuses a person who has had their hour, and nobody else", async () => {
    await record(A.orgId, A.userId, MAX_CALLS_PER_USER_PER_HOUR);

    await expect(reserve(A)).rejects.toBeInstanceOf(RateLimited);
    // The colleague sits in the same workspace and is untouched: the hour
    // belongs to a person, not to the team.
    await expect(reserve(colleague)).resolves.toBeUndefined();
  });

  it("forgets calls older than the hour", async () => {
    await record(A.orgId, A.userId, MAX_CALLS_PER_USER_PER_HOUR, "61 minutes");
    await expect(reserve(A)).resolves.toBeUndefined();
  });

  it("refuses a workspace that has had its day, and only that workspace", async () => {
    // Attributed to nobody, so no single person is over their own hour and
    // the ceiling that speaks is the workspace's.
    await record(A.orgId, null, MAX_CALLS_PER_WORKSPACE_PER_DAY);

    await expect(reserve(A)).rejects.toBeInstanceOf(RateLimited);
    await expect(reserve(colleague)).rejects.toBeInstanceOf(RateLimited);
    await expect(reserve(B)).resolves.toBeUndefined();
  });

  it("still stands underneath the installation's roof", async () => {
    // Far below the roof, so nothing but the workspace's own day can be
    // what refuses this.
    expect(MAX_CALLS_PER_WORKSPACE_PER_DAY).toBeLessThan(MAX_CALLS_PER_INSTALLATION_PER_DAY);
    await record(A.orgId, null, MAX_CALLS_PER_WORKSPACE_PER_DAY);
    await expect(reserve(A)).rejects.toBeInstanceOf(RateLimited);
    expect(await counted()).toBe(MAX_CALLS_PER_WORKSPACE_PER_DAY);
  });
});

describe("the installation's roof", () => {
  it("refuses a workspace that is nowhere near a ceiling of its own", async () => {
    // Every call so far belongs to A. B has spent nothing, and neither has
    // the person asking; the only thing over a line is the installation.
    await record(A.orgId, null, MAX_CALLS_PER_INSTALLATION_PER_DAY);

    await expect(reserve(B)).rejects.toBeInstanceOf(RateLimited);
    const { rows } = await admin.query<{ n: number }>(
      "select count(*)::int as n from ai_calls where org_id = $1",
      [B.orgId],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("lets the call one below the roof through, and the next one not", async () => {
    await record(A.orgId, null, MAX_CALLS_PER_INSTALLATION_PER_DAY - 1);

    await expect(reserve(B)).resolves.toBeUndefined();
    expect(await counted()).toBe(MAX_CALLS_PER_INSTALLATION_PER_DAY);
    await expect(reserve(B)).rejects.toBeInstanceOf(RateLimited);
    expect(await counted()).toBe(MAX_CALLS_PER_INSTALLATION_PER_DAY);
  });

  it("reads the last day, not the whole log", async () => {
    await record(A.orgId, null, MAX_CALLS_PER_INSTALLATION_PER_DAY, "25 hours");
    await expect(reserve(B)).resolves.toBeUndefined();
  });

  /**
   * The point of the definer's-rights function in drizzle/0015, in one
   * test: the same role, in the same tenant context, gets a count of one
   * workspace from the table and a count of the installation from the
   * function. If RLS ever slipped, the first number would grow; if the
   * function ever lost its owner's rights, the second would shrink to the
   * first and the roof would silently stop existing.
   */
  it("hands the application role a number that crosses workspaces, never a row", async () => {
    await record(A.orgId, null, 7);
    await record(B.orgId, null, 5);

    const seen = await asApp(app, A, async (client) => {
      const rows = await client.query("select org_id from ai_calls");
      const total = await client.query<{ n: string }>("select ai_calls_last_day() as n");
      return { orgIds: rows.rows.map((r) => r.org_id), total: Number(total.rows[0]?.n ?? -1) };
    });

    expect(seen.orgIds).toHaveLength(7);
    expect(new Set(seen.orgIds)).toEqual(new Set([A.orgId]));
    expect(seen.total).toBe(12);
  });

  it("is not reachable from the auth role", async () => {
    const { rows } = await admin.query<{ ok: boolean }>(
      "select has_function_privilege('domino_auth', 'ai_calls_last_day()', 'execute') as ok",
    );
    expect(rows[0]?.ok).toBe(false);
  });
});

describe("the refusal comes before the model is asked", () => {
  function fakeModel() {
    const complete = vi.fn(async () => ({
      content: '{"ok":true}',
      model: "spy",
      usage: null,
    }));
    spy.provider = {
      id: "ollama",
      label: "Spy",
      model: "spy",
      complete,
      healthCheck: async () => ({ ok: true as const, detail: "" }),
    } as unknown as LlmProvider;
    return complete;
  }

  it("asks the model when there is room, so the test below means something", async () => {
    const complete = fakeModel();
    const { askForJson } = await import("@/modules/ai/service");

    await expect(askForJson(B, "test", [{ role: "user", content: "hej" }])).resolves.toEqual({
      data: { ok: true },
      engine: "ollama:spy",
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("does not ask it once the installation is over its roof", async () => {
    const complete = fakeModel();
    await record(A.orgId, null, MAX_CALLS_PER_INSTALLATION_PER_DAY);
    const { askForJson, classifyAiError } = await import("@/modules/ai/service");

    const error = await askForJson(B, "test", [{ role: "user", content: "hej" }]).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimited);
    // The word the interface already has for this. No new failure invented.
    expect(classifyAiError(error)).toBe("rateLimited");
    expect(complete).not.toHaveBeenCalled();
    // Nothing was spent and nothing was written down as if it had been.
    expect(await counted()).toBe(MAX_CALLS_PER_INSTALLATION_PER_DAY);
  });
});

describe("what the installation chooses", () => {
  const REQUIRED = {
    APP_DATABASE_URL: "postgres://app:app@localhost:5432/domino",
    AUTH_DATABASE_URL: "postgres://auth:auth@localhost:5432/domino",
    BETTER_AUTH_SECRET: "not-a-real-secret-for-tests-only",
  };

  it("ships a roof a real team does not meet", () => {
    expect(EnvSchema.parse(REQUIRED).AI_DAILY_CALL_CAP).toBe(2000);
    expect(MAX_CALLS_PER_INSTALLATION_PER_DAY).toBe(2000);
    // Several full workspaces' worth, so the ceiling a team can feel is
    // still its own and the roof is the installation's backstop.
    expect(MAX_CALLS_PER_INSTALLATION_PER_DAY).toBeGreaterThan(3 * MAX_CALLS_PER_WORKSPACE_PER_DAY);
  });

  it("takes a number from the operator", () => {
    expect(EnvSchema.parse({ ...REQUIRED, AI_DAILY_CALL_CAP: "250" }).AI_DAILY_CALL_CAP).toBe(250);
    expect(EnvSchema.safeParse({ ...REQUIRED, AI_DAILY_CALL_CAP: "-1" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...REQUIRED, AI_DAILY_CALL_CAP: "1.5" }).success).toBe(false);
  });

  /**
   * Dogma 2: a self-hoster running Ollama on their own machine pays
   * nothing per call, and a roof they did not ask for would be this
   * tool deciding how much of their own hardware they may use. 0 removes
   * it — and the two ceilings that protect a person from a runaway page
   * stay exactly where they were.
   */
  it("lets a self-hoster take the roof off with 0, keeping the rest", async () => {
    vi.doMock("@/core/env", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/core/env")>();
      return { ...actual, env: { ...actual.env, AI_DAILY_CALL_CAP: 0 } };
    });
    vi.resetModules();
    try {
      const limits = await import("@/modules/ai/limits");
      const tenant = await import("@/core/db/tenant");
      expect(limits.MAX_CALLS_PER_INSTALLATION_PER_DAY).toBe(0);

      await record(A.orgId, null, MAX_CALLS_PER_INSTALLATION_PER_DAY * 2);
      await expect(
        tenant.withOrgContext(B, (tx) => limits.reserveAiCall(tx, B, "test", "test")),
      ).resolves.toBeUndefined();

      // The workspace's own day still bites underneath.
      await record(B.orgId, null, MAX_CALLS_PER_WORKSPACE_PER_DAY);
      await expect(
        tenant.withOrgContext(B, (tx) => limits.reserveAiCall(tx, B, "test", "test")),
      ).rejects.toBeInstanceOf(limits.RateLimited);
    } finally {
      vi.doUnmock("@/core/env");
      vi.resetModules();
    }
  });
});
