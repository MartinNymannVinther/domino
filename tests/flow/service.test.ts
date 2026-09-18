import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import {
  archiveFlow,
  createFlow,
  deleteFlow,
  exportFlow,
  getFlow,
  importFlow,
  listFlows,
} from "@/modules/flow/service";
import { commitPatch, listVersions, revertToVersion } from "@/modules/flow/versions";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * The flow service through the RLS-guarded path: versions numbered in
 * order, a patch that lands whole or not at all, a conflict when the
 * canvas has moved on, undo as a new version, and a flow that is not
 * this workspace's simply not found.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;

let admin: Pool;
let a: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "flowsvc_a");
  b = await seedWorkspace(admin, "flowsvc_b");
});

afterAll(async () => {
  await admin.end();
});

describe("flows", () => {
  it("are created as version 1 and listed", async () => {
    const created = await createFlow(a, summary, { message: "fra eksempel" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const flow = await getFlow(a, created.flowId);
    expect(flow).toMatchObject({
      name: summary.name,
      version: { number: 1, actorKind: "user", message: "fra eksempel" },
    });
    expect(flow!.document).toEqual(summary);
    expect((await listFlows(a)).map((f) => f.id)).toContain(created.flowId);
    // The other workspace sees nothing of it.
    expect(await getFlow(b, created.flowId)).toBeNull();
    expect((await listFlows(b)).map((f) => f.id)).not.toContain(created.flowId);
  });

  it("refuse a document that does not hold together", async () => {
    const result = await createFlow(a, { ...summary, edges: [] });
    expect(result.ok).toBe(false);
  });

  it("change by patch, one version at a time, and refuse a stale base", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const first = await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "setMeta", name: "Nyt navn" }] },
      { actorKind: "user", message: "omdøbt", baseVersionId: created.versionId },
    );
    expect(first).toMatchObject({ ok: true, number: 2 });
    if (!first.ok) return;
    // The list carries the new name, read off the flow row.
    expect((await listFlows(a)).find((f) => f.id === created.flowId)?.name).toBe("Nyt navn");

    const stale = await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "setMeta", name: "Igen" }] },
      { actorKind: "ai", message: "", baseVersionId: created.versionId },
    );
    expect(stale).toMatchObject({ ok: false, error: "conflict" });

    const broken = await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "removeEdge", id: "e2" }] },
      { actorKind: "user", message: "" },
    );
    expect(broken).toMatchObject({ ok: false, error: "invalid", at: -1 });

    const versions = await listVersions(a, created.flowId);
    expect(versions.map((v) => [v.number, v.message, v.patch?.ops.length ?? 0])).toEqual([
      [1, "", 0],
      [2, "omdøbt", 1],
    ]);

    // Nobody else's flow: not found, not "forbidden".
    const elsewhere = await commitPatch(
      b,
      created.flowId,
      { ops: [{ op: "setMeta", name: "Hacket" }] },
      { actorKind: "user", message: "" },
    );
    expect(elsewhere).toMatchObject({ ok: false, error: "notFound" });
  });

  it("undo is a new version with the older document", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    await commitPatch(
      a,
      created.flowId,
      { ops: [{ op: "updateNode", id: "n4", title: "Resultat" }] },
      { actorKind: "ai", message: "foreslået", baseVersionId: created.versionId },
    );
    const reverted = await revertToVersion(a, created.flowId, created.versionId, "fortrudt");
    expect(reverted).toMatchObject({ ok: true, number: 3 });
    const flow = await getFlow(a, created.flowId);
    expect(flow!.document).toEqual(summary);
    expect((await listVersions(a, created.flowId)).map((v) => v.number)).toEqual([1, 2, 3]);
  });

  it("go out as a file and come back in as a new flow", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    const exported = await exportFlow(a, created.flowId);
    expect(exported?.name).toBe(summary.name);
    const imported = await importFlow(a, exported!.text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.flowId).not.toBe(created.flowId);
    expect((await getFlow(a, imported.flowId))!.document).toEqual(summary);
    expect(await importFlow(a, "{}")).toMatchObject({ ok: false, result: { reason: "notAFlow" } });
    expect(await exportFlow(b, created.flowId)).toBeNull();
  });

  it("can be archived and deleted, versions and all", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    expect(await archiveFlow(a, created.flowId, true)).toBe(true);
    expect((await listFlows(a)).map((f) => f.id)).not.toContain(created.flowId);
    expect(await deleteFlow(b, created.flowId)).toBe(false);
    expect(await deleteFlow(a, created.flowId)).toBe(true);
    const left = await admin.query(
      "select count(*)::int as n from flow_versions where flow_id = $1",
      [created.flowId],
    );
    expect(left.rows[0].n).toBe(0);
  });
});
