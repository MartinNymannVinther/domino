import { todayInCopenhagen } from "@/core/dates";
import { buildWorkbook, type CellValue, type Sheet } from "@/core/xlsx";
import type { OrgExport } from "./service";

/**
 * The same export in two shapes, built from the same rows.
 *
 * The spreadsheet is for people: one tab per kind of thing, filterable,
 * openable by a board member who has never heard of Domino. The JSON is
 * for machines: it keeps every id, so the relationships between a project,
 * its milestones and its tasks survive the trip. Neither is a backup — a
 * backup is a database dump you can restore, and that is a different thing
 * from a copy you can read.
 */

/** A file name that sorts by date and says where it came from. */
export function exportFileName(orgName: string, exportedAt: Date, extension: string): string {
  const slug =
    orgName
      .toLowerCase()
      .replace(/[æ]/g, "ae")
      .replace(/[ø]/g, "oe")
      .replace(/[å]/g, "aa")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "domino";
  // The day the file is named for is the day here, not in UTC: an export
  // taken at half past midnight in Copenhagen is not yesterday's.
  const date = todayInCopenhagen(exportedAt);
  return `domino-${slug}-${date}.${extension}`;
}

/**
 * Postgres hands back dates, numbers, booleans, arrays and JSON. A cell can
 * hold a string, a number or a date; everything else is written the way a
 * reader would want to see it rather than the way JavaScript prints it.
 */
function cell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "ja" : "nej";
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return JSON.stringify(value);
}

export function exportToXlsx(data: OrgExport): Buffer {
  const sheets: Sheet[] = data.sections.map((section) => ({
    name: section.sheet,
    // An empty table still gets its tab, so the file shows what Domino holds
    // rather than only what happens to be filled in.
    columns:
      section.columns.length > 0
        ? section.columns.map((header) => ({ header }))
        : [{ header: "(ingen rækker)" }],
    rows: section.rows.map((row) => row.map(cell)),
  }));

  return buildWorkbook(sheets);
}

export function exportToJson(data: OrgExport): string {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  for (const section of data.sections) {
    tables[section.sheet] = section.rows.map((row) =>
      Object.fromEntries(section.columns.map((column, index) => [column, row[index] ?? null])),
    );
  }

  return JSON.stringify(
    {
      domino: { format: 1, exportedAt: data.exportedAt.toISOString() },
      organization: data.organization,
      tables,
    },
    null,
    2,
  );
}
