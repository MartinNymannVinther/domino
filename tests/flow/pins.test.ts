import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import { clearPin, listPins, MAX_PIN_CHARS, pinsFor, setPin } from "@/modules/flow/pins";
import { createFlow, exportFlow } from "@/modules/flow/service";
import { listVersions } from "@/modules/flow/versions";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

/**
 * Examples fastened to a brick (docs/adr/0014): kept beside the flow,
 * so they never make a version and never leave with an exported file,
 * and invisible to any other workspace.
 */

const summary = EXAMPLE_FLOWS.find((e) => e.key === "summary")!.document;
let admin: Pool;
let a: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "pins_a");
  b = await seedWorkspace(admin, "pins_b");
});
afterAll(async () => {
  await admin.end();
});

describe("pins", () => {
  it("are kept per port, replaced in place, and do not touch the flow", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    expect(await setPin(a, created.flowId, "n3", "n2.text", "første eksempel")).toBe("saved");
    expect(await setPin(a, created.flowId, "n3", "n2.text", "andet eksempel")).toBe("saved");
    expect(await pinsFor(a, created.flowId, "n3")).toEqual({ "n2.text": "andet eksempel" });
    expect(await listPins(a, created.flowId)).toHaveLength(1);

    // No version, and nothing in the exported file.
    expect(await listVersions(a, created.flowId)).toHaveLength(1);
    expect((await exportFlow(a, created.flowId))!.text).not.toContain("andet eksempel");
  });

  it("refuse a value bigger than a brick would read", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    expect(await setPin(a, created.flowId, "n3", "n2.text", "x".repeat(MAX_PIN_CHARS + 1))).toBe(
      "tooBig",
    );
  });

  it("are the workspace's own, and are let go on request", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    await setPin(a, created.flowId, "n3", "n2.text", "eksempel");
    expect(await pinsFor(b, created.flowId, "n3")).toEqual({});
    expect(await clearPin(b, created.flowId, "n3")).toBe(0);
    expect(await clearPin(a, created.flowId, "n3")).toBe(1);
    expect(await pinsFor(a, created.flowId, "n3")).toEqual({});
  });

  it("go with the flow when it is deleted", async () => {
    const created = await createFlow(a, summary);
    if (!created.ok) throw new Error("setup");
    await setPin(a, created.flowId, "n3", "n2.text", "eksempel");
    await admin.query("delete from flows where id = $1", [created.flowId]);
    const left = await admin.query("select count(*)::int as n from flow_pins where flow_id = $1", [
      created.flowId,
    ]);
    expect(left.rows[0].n).toBe(0);
  });
});
