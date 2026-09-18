import { requireOrgContext } from "@/core/auth/guard";
import { buildXlsx } from "@/core/xlsx";
import { PortIndex } from "@/modules/flow";
import { getRun } from "@/modules/runs/service";
import { tableRows } from "@/modules/runs/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A table output as a spreadsheet (dogma three): the schema's fields as
 * columns, one row per item, through src/core/xlsx. Same guard as the
 * run itself.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id, nodeId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[a-z][a-z0-9_]{0,31}$/.test(nodeId))
    return new Response("Not found", { status: 404 });
  const run = await getRun(ctx, id);
  const node = run?.document.nodes.find((n) => n.id === nodeId);
  if (!run || !node || node.type !== "output") return new Response("Not found", { status: 404 });
  const value = run.output?.[nodeId];
  const columns = new PortIndex(run.document).tableColumns(nodeId);
  const table = tableRows(value, columns);
  const workbook = buildXlsx({
    name: node.config.label.slice(0, 31) || "Domino",
    columns: table.columns.map((header) => ({ header, width: 24 })),
    rows: table.rows,
  });
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nodeId}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
