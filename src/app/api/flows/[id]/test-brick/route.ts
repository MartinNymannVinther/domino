import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
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
  const inputs = await lastInputsFor(ctx, id, nodeId);
  return NextResponse.json({ ok: true, inputs }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({
  nodeId: z.string().regex(NODE),
  inputs: z.record(z.string().max(64), z.unknown()),
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

function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
