import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { LlmProvider } from "@/core/llm";
import { storeFile } from "@/modules/files/service";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import { createFlow } from "@/modules/flow/service";
import { runQueued } from "@/modules/runs/runner";
import { startRun } from "@/modules/runs/service";
import { lastInputsFor, testBrick } from "@/modules/runs/test-brick";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * One brick on its own: run with what the person gave, nothing stored,
 * and the last run's values offered as the starting point.
 */

const spy = vi.hoisted(() => ({ provider: null as LlmProvider | null }));
vi.mock("@/modules/ai/model-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ai/model-settings")>()),
  workspaceLlmProvider: async () => spy.provider,
}));

const triage = EXAMPLE_FLOWS.find((e) => e.key === "triage")!.document;
const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
let admin: Pool;
let a: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "brick_a");
  b = await seedWorkspace(admin, "brick_b");
  await admin.query("delete from runs");
});
afterAll(async () => {
  await admin.query("delete from ai_calls");
  await admin.end();
});

describe("testing a brick", () => {
  it("runs a template with the text given and stores nothing", async () => {
    const created = await createFlow(a, triage);
    if (!created.ok) throw new Error("setup");
    const result = await testBrick(a, created.flowId, "n4", {
      "n3.yes": JSON.stringify({ kategori: "klage", resume: "Vil have penge tilbage." }),
    });
    expect(result).toMatchObject({
      ok: true,
      outputs: { text: expect.stringContaining("HASTER – klage") },
      tokensIn: 0,
    });
    const runs = await admin.query("select count(*)::int as n from runs where flow_id = $1", [
      created.flowId,
    ]);
    expect(runs.rows[0].n).toBe(0);
    expect(await testBrick(b, created.flowId, "n4", {})).toMatchObject({
      ok: false,
      reason: "notFound",
    });
    expect(await testBrick(a, created.flowId, "n1", {})).toMatchObject({
      ok: false,
      reason: "untestable",
    });
  });

  it("asks the model for a prompt brick and counts the call", async () => {
    spy.provider = {
      id: "fake",
      label: "Fake",
      model: "test",
      async complete() {
        return { content: "Kort.", model: "test", usage: { inputTokens: 5, outputTokens: 1 } };
      },
      async healthCheck() {
        return { ok: true, detail: "" };
      },
    };
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const result = await testBrick(a, created.flowId, "n3", { "n2.text": "En lang tekst." });
    expect(result).toMatchObject({
      ok: true,
      outputs: { text: "Kort." },
      tokensIn: 5,
      tokensOut: 1,
    });
    const counted = await admin.query(
      "select count(*)::int as n from ai_calls where org_id = $1 and kind = 'test'",
      [a.orgId],
    );
    expect(counted.rows[0].n).toBe(1);
    spy.provider = null;
    expect(await testBrick(a, created.flowId, "n3", { "n2.text": "x" })).toMatchObject({
      ok: false,
      reason: "failed",
      error: expect.stringContaining("no model"),
    });
  });

  it("offers what the last run carried to the brick", async () => {
    spy.provider = {
      id: "fake",
      label: "Fake",
      model: "test",
      async complete() {
        return { content: "Sammenfatning.", model: "test", usage: null };
      },
      async healthCheck() {
        return { ok: true, detail: "" };
      },
    };
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    expect(await lastInputsFor(a, created.flowId, "n3")).toEqual({});
    const file = await storeFile(a, created.flowId, {
      name: "doc.txt",
      mime: "text/plain",
      bytes: Buffer.from("Dokumentets tekst"),
    });
    if (!file.ok) throw new Error("upload");
    const started = await startRun(a, created.flowId, "full", { n1: file.ref });
    if (!started.ok) throw new Error("start");
    await runQueued();
    expect(await lastInputsFor(a, created.flowId, "n3")).toEqual({
      "n2.text": "Dokumentets tekst",
    });
    expect(await lastInputsFor(a, created.flowId, "n4")).toEqual({ value: "Sammenfatning." });
    expect(await lastInputsFor(b, created.flowId, "n3")).toEqual({});
  });
});
