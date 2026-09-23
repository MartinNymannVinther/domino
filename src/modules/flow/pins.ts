import { and, eq, sql } from "drizzle-orm";
import { flowPins } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import type { Value } from "@/modules/engine";

/**
 * Example values fastened to a brick's inputs (docs/adr/0014): what the
 * brick should be handed when it is tried on its own, kept so the next
 * brick down can be tried without running the flow again.
 *
 * Beside the flow, never in it: a pin is not a change to the flow, it
 * would otherwise make a version every time it changed, and it must not
 * travel with an exported file — it is often a page of somebody's
 * document. It does travel in the workspace's own export, like every
 * other row the workspace owns.
 */

export const MAX_PIN_CHARS = 200_000;
export const MAX_PINS_PER_FLOW = 100;

export type Pin = { nodeId: string; port: string; value: Value; updatedAt: Date };

export async function listPins(ctx: OrgContext, flowId: string): Promise<Pin[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        nodeId: flowPins.nodeId,
        port: flowPins.port,
        value: flowPins.value,
        updatedAt: flowPins.updatedAt,
      })
      .from(flowPins)
      .where(eq(flowPins.flowId, flowId));
    return rows.map((r) => ({ ...r, value: r.value as Value }));
  });
}

/** The pins for one brick, keyed by port, for the panel that tries it. */
export async function pinsFor(
  ctx: OrgContext,
  flowId: string,
  nodeId: string,
): Promise<Record<string, Value>> {
  const pins = await listPins(ctx, flowId);
  return Object.fromEntries(pins.filter((p) => p.nodeId === nodeId).map((p) => [p.port, p.value]));
}

export type PinResult = "saved" | "tooBig" | "tooMany";

/** Fastens one value, replacing what was on that port. */
export async function setPin(
  ctx: OrgContext,
  flowId: string,
  nodeId: string,
  port: string,
  value: Value,
): Promise<PinResult> {
  const size = JSON.stringify(value ?? null).length;
  if (size > MAX_PIN_CHARS) return "tooBig";
  return withOrgContext(ctx, async (tx) => {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(flowPins)
      .where(eq(flowPins.flowId, flowId));
    const existing = await tx
      .select({ id: flowPins.id })
      .from(flowPins)
      .where(and(eq(flowPins.flowId, flowId), eq(flowPins.nodeId, nodeId), eq(flowPins.port, port)))
      .limit(1);
    if (!existing.length && (count?.n ?? 0) >= MAX_PINS_PER_FLOW) return "tooMany";
    await tx
      .insert(flowPins)
      .values({ orgId: ctx.orgId, flowId, nodeId, port, value, createdBy: ctx.userId })
      .onConflictDoUpdate({
        target: [flowPins.flowId, flowPins.nodeId, flowPins.port],
        set: { value, updatedAt: new Date() },
      });
    return "saved";
  });
}

/** Loosens one port's pin, or every pin on a brick when no port is named. */
export async function clearPin(
  ctx: OrgContext,
  flowId: string,
  nodeId: string,
  port?: string,
): Promise<number> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .delete(flowPins)
      .where(
        and(
          eq(flowPins.flowId, flowId),
          eq(flowPins.nodeId, nodeId),
          ...(port ? [eq(flowPins.port, port)] : []),
        ),
      )
      .returning({ id: flowPins.id }),
  );
  return rows.length;
}
