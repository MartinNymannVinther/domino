import type { CellValue } from "@/core/xlsx";

/**
 * A table output as rows and columns: the schema's fields in order
 * when the graph names them, otherwise every key the rows carry, in
 * the order first seen. Nested values are written as JSON so no cell
 * is silently lost. Used by the page and by the spreadsheet alike.
 */
export function tableRows(
  value: unknown,
  declared: string[] | null,
): { columns: string[]; rows: CellValue[][] } {
  const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const columns = [...(declared ?? [])];
  const objects: Array<Record<string, unknown>> = items.map((item) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : { value: item },
  );
  for (const row of objects)
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  return {
    columns,
    rows: objects.map((row) => columns.map((column) => cell(row[column]))),
  };
}

function cell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "ja" : "nej";
  return JSON.stringify(v);
}
