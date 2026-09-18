import { NextResponse } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { getRun } from "@/modules/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A run as it stands, for the page that watches it fall step by step.
 * Polled while the run is queued or running; the same guard as every
 * read, and a run that is not the workspace's is not found.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
  const run = await getRun(ctx, id);
  if (!run) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, run }, { headers: { "Cache-Control": "no-store" } });
}
