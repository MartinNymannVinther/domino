"use server";

import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import type { Value } from "@/modules/engine";
import { clearPin, MAX_PIN_CHARS, setPin, type PinResult } from "./pins";
import { getFlow } from "./service";

/**
 * Fastening an example to a brick's input (docs/adr/0014). A write, so
 * an action; the flow and the brick are looked up inside the caller's
 * workspace, and a value bigger than a brick would ever read is refused
 * here rather than stored.
 */

const Id = z.string().min(1).max(64);
const Node = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const Port = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/);

export async function setPinAction(raw: unknown): Promise<Result<PinResult>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({
      flowId: Id,
      nodeId: Node,
      port: Port,
      value: z.union([z.string().max(MAX_PIN_CHARS), z.record(z.string().max(64), z.unknown())]),
    })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, nodeId, port, value } = parsed.data;
  const flow = await getFlow(ctx, flowId);
  if (!flow || !flow.document.nodes.some((n) => n.id === nodeId)) return fail("notFound");
  return ok(await setPin(ctx, flowId, nodeId, port, value as Value));
}

export async function clearPinAction(raw: unknown): Promise<Result<number>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ flowId: Id, nodeId: Node, port: Port.optional() }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { flowId, nodeId, port } = parsed.data;
  return ok(await clearPin(ctx, flowId, nodeId, port));
}
