import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import {
  acceptProposal,
  listMessages,
  recordExchange,
  rejectProposal,
} from "@/modules/flow/messages";
import { createFlow, getFlow } from "@/modules/flow/service";
import { commitPatch, listVersions } from "@/modules/flow/versions";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * The conversation and its proposals (docs/adr/0011): stored as the
 * exchange went, applied only on a yes — as the model's hand, against
 * the version it was written for — and turned down without a trace on
 * the flow. Another workspace's flow: nothing to see, nothing to do.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
let admin: Pool;
let a: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "chat_a");
  b = await seedWorkspace(admin, "chat_b");
});
afterAll(async () => {
  await admin.end();
});

const proposal = (baseVersionId: string) => ({
  baseVersionId,
  patch: { ops: [{ op: "updateNode" as const, id: "n4", title: "Kort resumé" }] },
});

describe("the conversation", () => {
  it("stores the exchange and applies the proposal on a yes, as the model's version", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const { assistantId } = await recordExchange(a, created.flowId, {
      user: "kald outputtet Kort resumé",
      assistant: "Omdøbt.",
      engine: "fake:test",
      proposal: proposal(created.versionId),
    });
    const before = await listMessages(a, created.flowId);
    expect(before.map((m) => [m.role, m.proposalStatus])).toEqual([
      ["user", null],
      ["assistant", "proposed"],
    ]);
    const accepted = await acceptProposal(a, created.flowId, assistantId);
    expect(accepted).toMatchObject({ ok: true, number: 2 });
    const flow = await getFlow(a, created.flowId);
    expect(flow!.document.nodes.find((n) => n.id === "n4")!.title).toBe("Kort resumé");
    expect(flow!.version.actorKind).toBe("ai");
    const after = await listMessages(a, created.flowId);
    expect(after[1]).toMatchObject({
      proposalStatus: "accepted",
      resultVersionId: flow!.version.id,
    });
    // Twice is not a thing.
    expect(await acceptProposal(a, created.flowId, assistantId)).toMatchObject({
      ok: false,
      error: "notFound",
    });
  });

  it("refuses a proposal written for a version that has moved on", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const { assistantId } = await recordExchange(a, created.flowId, {
      user: "x",
      assistant: "y",
      engine: "",
      proposal: proposal(created.versionId),
    });
    await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "setMeta", name: "Ændret imens" }] },
      { actorKind: "user", message: "" },
    );
    expect(await acceptProposal(a, created.flowId, assistantId)).toMatchObject({
      ok: false,
      error: "conflict",
    });
  });

  it("turns a proposal down without touching the flow, and is blind across workspaces", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const { assistantId } = await recordExchange(a, created.flowId, {
      user: "x",
      assistant: "y",
      engine: "",
      proposal: proposal(created.versionId),
    });
    expect(await rejectProposal(b, created.flowId, assistantId)).toBe(false);
    expect(await acceptProposal(b, created.flowId, assistantId)).toMatchObject({
      ok: false,
      error: "notFound",
    });
    expect(await rejectProposal(a, created.flowId, assistantId)).toBe(true);
    expect((await listVersions(a, created.flowId)).length).toBe(1);
    expect((await listMessages(a, created.flowId))[1]!.proposalStatus).toBe("rejected");
    expect(await listMessages(b, created.flowId)).toEqual([]);
  });
});
