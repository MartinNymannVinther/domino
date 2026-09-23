import { NextResponse } from "next/server";
import { z } from "zod";
import { crossSite } from "@/core/auth/cross-site";
import { requireOrgContext } from "@/core/auth/guard";
import { RUN_LIMITS } from "@/modules/flow";
import { pinsFor } from "@/modules/flow/pins";
import { lastInputsFor, testBrick } from "@/modules/runs/test-brick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trying one brick on its own (docs/adr/0008: a read on a route, so a
 * slow model never holds back the person's edits). GET says what the
 * last run carried to the brick; POST runs it with what the form gave.
 * Nothing is stored either way.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NODE = /^[a-z][a-z0-9_]{0,31}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const nodeId = new URL(request.url).searchParams.get("nodeId") ?? "";
  if (!ID.test(id) || !NODE.test(nodeId)) return NextResponse.json({ ok: false }, { status: 404 });
  // What was fastened to the brick wins over what the last run carried:
  // a pin is the example the person chose to keep (docs/adr/0014).
  const [fromRun, pins] = await Promise.all([
    lastInputsFor(ctx, id, nodeId),
    pinsFor(ctx, id, nodeId),
  ]);
  return NextResponse.json(
    { ok: true, inputs: { ...fromRun, ...pins }, pinned: Object.keys(pins) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** A value per port: text up to a run input's size, or a file reference; eight ports at most. */
const Given = z.union([
  z.string().max(RUN_LIMITS.textChars),
  z.object({ fileId: z.string().max(64), name: z.string().max(255), mime: z.string().max(120) }),
]);
const Body = z.object({
  nodeId: z.string().regex(NODE),
  inputs: z
    .record(z.string().max(64), Given.optional())
    .refine((r) => Object.keys(r).length <= 8, "ports"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  if (crossSite(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await testBrick(ctx, id, parsed.data.nodeId, parsed.data.inputs);
  return NextResponse.json(
    { ok: true, result },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
