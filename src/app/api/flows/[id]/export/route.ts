import { requireOrgContext } from "@/core/auth/guard";
import { exportFlow } from "@/modules/flow/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One flow as one file (dogma three, docs/adr/0011). Behind the same
 * session and workspace guard as everything else: the id is looked up
 * inside the caller's workspace, and a flow that is not theirs is not
 * found. Marked no-store, like every export.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new Response("Not found", { status: 404 });
  const exported = await exportFlow(ctx, id);
  if (!exported) return new Response("Not found", { status: 404 });
  return new Response(exported.text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName(exported.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** ASCII only: the header cannot carry æ, ø or å without a second encoding. */
function fileName(name: string): string {
  const base = name
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "flow"}.domino.json`;
}
