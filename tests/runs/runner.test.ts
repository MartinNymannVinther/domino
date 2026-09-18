import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { LlmProvider } from "@/core/llm";
import { storeFile } from "@/modules/files/service";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import { createFlow } from "@/modules/flow/service";
import { commitPatch } from "@/modules/flow/versions";
import { claimNextRun, performRun, runQueued } from "@/modules/runs/runner";
import { cancelRun, getRun, lastRuns, listRuns, startRun } from "@/modules/runs/service";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * The runner end to end (CLAUDE.md, tests where they matter): a run is
 * queued with validated input, claimed through the definer function,
 * run against the workspace's model with the workspace's files, and
 * written step by step; a test run takes one of each pile; a cancel
 * stops it; a flow with a loose end never starts; and a workspace sees
 * only its own runs.
 */

const spy = vi.hoisted(() => ({ provider: null as LlmProvider | null }));
vi.mock("@/modules/ai/model-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ai/model-settings")>()),
  workspaceLlmProvider: async () => spy.provider,
}));

function fakeProvider(answer: (prompt: string) => string): LlmProvider {
  return {
    id: "fake",
    label: "Fake",
    model: "test",
    async complete(messages) {
      const user = messages.find((m) => m.role === "user")?.content ?? "";
      return { content: answer(user), model: "test", usage: { inputTokens: 7, outputTokens: 3 } };
    },
    async healthCheck() {
      return { ok: true, detail: "" };
    },
  };
}

const applications = EXAMPLE_FLOWS.find((e) => e.key === "applications")!.document;
const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;

let admin: Pool;
let a: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "runner_a");
  b = await seedWorkspace(admin, "runner_b");
  // The queue is shared by every suite; start from an empty one.
  await admin.query("delete from runs");
});

afterAll(async () => {
  await admin.query("delete from ai_calls");
  await admin.end();
});

async function upload(ctx: typeof a, flowId: string, name: string, text: string) {
  const stored = await storeFile(ctx, flowId, {
    name,
    mime: "text/plain",
    bytes: Buffer.from(text, "utf8"),
  });
  if (!stored.ok) throw new Error("upload");
  return stored.ref;
}

describe("a run", () => {
  it("goes from queued to done with a step per brick per item, and a table at the end", async () => {
    spy.provider = fakeProvider((prompt) => {
      const who = /Jeg hedder (\w+)/.exec(prompt)?.[1] ?? "ukendt";
      return JSON.stringify({
        navn: who,
        uddannelse: "x",
        erfaring: "y",
        motivation: "z",
        vurdering: "stærk",
      });
    });
    const created = await createFlow(a, applications);
    if (!created.ok) throw new Error("setup");
    const files = [
      await upload(a, created.flowId, "a.txt", "Jeg hedder Anna"),
      await upload(a, created.flowId, "b.txt", "Jeg hedder Bo"),
    ];
    const started = await startRun(a, created.flowId, "full", { n1: files });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    expect((await getRun(a, started.runId))?.status).toBe("queued");
    expect(await getRun(b, started.runId)).toBeNull();
    expect(await runQueued()).toBe(1);

    const run = await getRun(a, started.runId);
    expect(run).toMatchObject({
      status: "done",
      engine: "fake:test",
      tokensIn: 14,
      tokensOut: 6,
    });
    const table = run!.output!.n6 as Array<{ navn: string }>;
    expect(table.map((r) => r.navn)).toEqual(["Anna", "Bo"]);
    // Every step written: input once, loop start, then 3 bricks × 2 items, loop end, output.
    const steps = run!.steps.map((s) => `${s.nodeId}#${s.iteration}:${s.status}`);
    expect(steps).toEqual([
      "n1#0:done",
      "n2#0:done",
      "n3#0:done",
      "n4#0:done",
      "n3#1:done",
      "n4#1:done",
      "n5#0:done",
      "n6#0:done",
    ]);
    expect(run!.stepCount).toBe(8);
    expect(run!.steps[3]!.output).toMatchObject({ json: { navn: "Anna" } });
    // The calls were counted for the workspace, as run calls.
    const counted = await admin.query(
      "select count(*)::int as n from ai_calls where org_id = $1 and kind = 'run'",
      [a.orgId],
    );
    expect(counted.rows[0].n).toBe(2);
    expect((await lastRuns(a)).get(created.flowId)?.id).toBe(started.runId);
    expect((await listRuns(b, created.flowId)).length).toBe(0);
  });

  it("as a test keeps one item of each pile", async () => {
    spy.provider = fakeProvider(() =>
      JSON.stringify({
        navn: "A",
        uddannelse: "x",
        erfaring: "y",
        motivation: "z",
        vurdering: "svag",
      }),
    );
    const created = await createFlow(a, applications);
    if (!created.ok) throw new Error("setup");
    const files = [
      await upload(a, created.flowId, "a.txt", "1"),
      await upload(a, created.flowId, "b.txt", "2"),
      await upload(a, created.flowId, "c.txt", "3"),
    ];
    const started = await startRun(a, created.flowId, "test", { n1: files });
    if (!started.ok) throw new Error("start");
    await runQueued();
    const run = await getRun(a, started.runId);
    expect(run!.status).toBe("done");
    expect((run!.output!.n6 as unknown[]).length).toBe(1);
    expect(run!.input.n1).toHaveLength(1);
  });

  it("refuses to start on a loose end, on bad input, and on a file that is not the workspace's", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const file = await upload(a, created.flowId, "doc.txt", "tekst");
    expect(await startRun(a, created.flowId, "full", {})).toMatchObject({
      ok: false,
      reason: "invalidInput",
    });
    const foreign = await createFlow(b, summary);
    if (!foreign.ok) throw new Error("setup");
    expect(await startRun(b, foreign.flowId, "full", { n1: file })).toMatchObject({
      ok: false,
      reason: "unknownFile",
    });
    await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "removeEdge", id: "e3" }] },
      { actorKind: "user", message: "" },
    );
    expect(await startRun(a, created.flowId, "full", { n1: file })).toMatchObject({
      ok: false,
      reason: "unfinished",
    });
    expect(await startRun(b, created.flowId, "full", { n1: file })).toMatchObject({
      ok: false,
      reason: "notFound",
    });
  });

  it("fails on the brick that failed, and says so on the run", async () => {
    spy.provider = null;
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const file = await upload(a, created.flowId, "doc.txt", "tekst");
    const started = await startRun(a, created.flowId, "full", { n1: file });
    if (!started.ok) throw new Error("start");
    await runQueued();
    const run = await getRun(a, started.runId);
    expect(run).toMatchObject({
      status: "failed",
      error: "n3: no model is configured for this workspace",
    });
    expect(run!.steps.at(-1)).toMatchObject({ nodeId: "n3", status: "failed" });
  });

  it("stops when cancelled, and a cancelled queued run is never claimed", async () => {
    spy.provider = fakeProvider(() => "svar");
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const file = await upload(a, created.flowId, "doc.txt", "tekst");
    const queued = await startRun(a, created.flowId, "full", { n1: file });
    if (!queued.ok) throw new Error("start");
    expect(await cancelRun(a, queued.runId)).toBe(true);
    expect(await cancelRun(b, queued.runId)).toBe(false);
    expect(await claimNextRun()).toBeNull();
    expect((await getRun(a, queued.runId))?.status).toBe("cancelled");

    // Cancelled while running: the engine looks before every step.
    const running = await startRun(a, created.flowId, "full", { n1: file });
    if (!running.ok) throw new Error("start");
    const claimed = (await claimNextRun())!;
    expect(claimed.id).toBe(running.runId);
    await cancelRun(a, running.runId);
    await performRun(claimed);
    const run = await getRun(a, running.runId);
    expect(run).toMatchObject({ status: "cancelled", error: null });
    expect(run!.steps).toHaveLength(0);
  });
});
