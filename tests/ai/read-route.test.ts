import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError } from "@/core/llm";
import { RateLimited } from "@/modules/ai/limits";
import { NoModel } from "@/modules/ai/service";
import type { ProposalResult } from "@/modules/ai/wire";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * The read-only AI door (docs/adr/0034). The assists moved off server
 * actions so a thinking model can never hold back a person's own write —
 * and the move is only allowed to change the transport. What is asserted
 * here is that nothing else travelled with it: the session and workspace
 * are resolved before anything happens, the body is validated at the
 * boundary, the locale cannot be smuggled in, and a model that will not
 * answer degrades to a word rather than to a stack trace.
 *
 * The caller's context is the one thing that cannot be had in a test
 * process — `headers()` needs a request — so the guard module is stood in
 * for. Everything it guards is real.
 */

const stand = vi.hoisted(() => ({ ctx: null as { orgId: string; userId: string } | null }));
vi.mock("@/core/auth/guard", () => ({ requireOrgContext: async () => stand.ctx }));

const { aiRead } = await import("@/modules/ai/read-route");

const admin = adminPool();
afterAll(async () => {
  await admin.end();
});

const Body = z.object({ itemId: z.string().min(1) });

function ask(
  body: unknown,
  { locale = "da", origin }: { locale?: string; origin?: string } = {},
): Request {
  return new Request(`http://localhost/api/ai/close-advice?locale=${locale}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      ...(origin ? { origin } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function read<T>(response: Response): Promise<ProposalResult<T>> {
  return (await response.json()) as ProposalResult<T>;
}

describe("the AI read route", () => {
  it("resolves the caller first: no session, no model call", async () => {
    stand.ctx = null;
    let asked = false;
    const response = await aiRead(ask({ itemId: "x" }), Body, async () => {
      asked = true;
      return null;
    });
    expect(response.status).toBe(401);
    expect(await read(response)).toEqual({ ok: false, error: "unauthorized" });
    expect(asked).toBe(false);
  });

  it("answers only the page it served, as a server action would", async () => {
    stand.ctx = { orgId: "org_x", userId: "user_x" };
    let asked = false;
    const from = (origin?: string) =>
      aiRead(ask({ itemId: "i" }, { origin }), Body, async () => {
        asked = true;
        return { proposal: 1, engine: "e" };
      });
    expect((await from("http://evil.example")).status).toBe(403);
    expect(asked).toBe(false);
    expect((await from("http://localhost")).status).toBe(200);
    // No origin at all is not a browser reaching across; the session holds.
    expect((await from()).status).toBe(200);
  });

  it("validates the body at the boundary, and a body that is not JSON at all", async () => {
    stand.ctx = { orgId: "org_x", userId: "user_x" };
    let asked = false;
    const note = () => {
      asked = true;
      return Promise.resolve(null);
    };
    for (const body of [{ itemId: "" }, { other: 1 }, "{not json", []]) {
      const response = await aiRead(ask(body), Body, note);
      expect(response.status).toBe(400);
      expect(await read(response)).toEqual({ ok: false, error: "invalid" });
    }
    expect(asked).toBe(false);
  });

  it("hands the proposal on with its engine, uncached", async () => {
    stand.ctx = { orgId: "org_x", userId: "user_x" };
    const response = await aiRead(ask({ itemId: "i1" }), Body, async (_ctx, input) => ({
      proposal: [input.itemId],
      engine: "ollama:test",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await read(response)).toEqual({ ok: true, proposal: ["i1"], engine: "ollama:test" });
  });

  it("takes the locale the page names and refuses any other", async () => {
    stand.ctx = { orgId: "org_x", userId: "user_x" };
    const spoken = async (request: Request) => {
      let seen = "";
      await aiRead(request, Body, async (_ctx, _input, locale) => {
        seen = locale;
        return { proposal: 1, engine: "e" };
      });
      return seen;
    };
    expect(await spoken(ask({ itemId: "i" }, { locale: "en" }))).toBe("en");
    expect(await spoken(ask({ itemId: "i" }, { locale: "de" }))).toBe("da");
    // No locale at all falls back to Danish rather than to nothing.
    expect(
      await spoken(
        new Request("http://localhost/api/ai/close-advice", {
          method: "POST",
          body: JSON.stringify({ itemId: "i" }),
        }),
      ),
    ).toBe("da");
  });

  it("says what went wrong in one word, and keeps 5xx for what is actually broken", async () => {
    stand.ctx = { orgId: "org_x", userId: "user_x" };
    const thrown = async (error: unknown) =>
      aiRead(ask({ itemId: "i" }), Body, async () => {
        throw error;
      });

    const limited = await thrown(new RateLimited());
    expect(limited.status).toBe(429);
    expect(await read(limited)).toEqual({ ok: false, error: "rateLimited" });

    const down = await thrown(new LlmError("unreachable", "no answer"));
    expect(down.status).toBe(200);
    expect(await read(down)).toEqual({ ok: false, error: "unreachable" });

    const absent = await thrown(new NoModel());
    expect(absent.status).toBe(200);
    expect(await read(absent)).toEqual({ ok: false, error: "noModel" });

    const nothing = await aiRead(ask({ itemId: "i" }), Body, async () => null);
    expect(nothing.status).toBe(404);
    expect(await read(nothing)).toEqual({ ok: false, error: "notFound" });
  });

  it("without a model set up, answers so without asking one", async () => {
    // A real workspace, and the suite's installation has LLM_PROVIDER=none:
    // the quick assist fires on every pause in the typing, so it must cost
    // nothing at all when there is nothing to ask.
    stand.ctx = await seedWorkspace(admin, "airead");
    let asked = false;
    const response = await aiRead(
      ask({ itemId: "i" }),
      Body,
      async () => {
        asked = true;
        return null;
      },
      { requireModel: true },
    );
    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ ok: false, error: "noModel" });
    expect(asked).toBe(false);
  });
});
