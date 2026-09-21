import { NextResponse } from "next/server";
import { crossSite } from "@/core/auth/cross-site";
import { requireOrgContext } from "@/core/auth/guard";
import { rateLimit } from "@/core/rate-limit";
import { mimeFor } from "@/modules/files/extract";
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  MAX_UPLOAD_BYTES,
  storeFile,
  type UploadResult,
} from "@/modules/files/service";
import { getFlow } from "@/modules/flow/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files in: multipart, one or many, for one flow. Behind the session
 * and workspace guard; the flow id is looked up in the workspace before
 * a byte is kept. Each file is answered for on its own, so a pile with
 * one bad file loses that one, not the pile.
 */
export async function POST(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (crossSite(request))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  // A pile arrives in a few requests; a script filling the database
  // arrives in hundreds. Per person, in this process (docs/TECH-DEBT.md).
  const limit = rateLimit(`upload:${ctx.userId}`, 60, 60_000);
  if (!limit.allowed)
    return NextResponse.json(
      { ok: false, error: "rateLimited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const flowId = String(form.get("flowId") ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(flowId) || !(await getFlow(ctx, flowId)))
    return NextResponse.json({ ok: false, error: "notFound" }, { status: 404 });
  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0 || entries.length > MAX_FILES_PER_UPLOAD)
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  // One request holds one pile, not a disk: the per-file ceiling times a
  // handful, so a pile of two hundred arrives in a few requests.
  const total = entries.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UPLOAD_BYTES)
    return NextResponse.json({ ok: false, error: "tooBig" }, { status: 413 });

  const results: Array<{ name: string } & UploadResult> = [];
  for (const entry of entries) {
    if (entry.size > MAX_FILE_BYTES) {
      results.push({ name: entry.name, ok: false, reason: "tooBig" });
      continue;
    }
    const bytes = Buffer.from(await entry.arrayBuffer());
    const stored = await storeFile(ctx, flowId, {
      name: entry.name,
      mime: mimeFor(entry.name, entry.type),
      bytes,
    });
    results.push({ name: entry.name, ...stored });
  }
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
