import { deflateRawSync } from "node:zlib";

/**
 * A minimal .xlsx writer: flat tables, one or many sheets.
 *
 * An xlsx file is a ZIP holding a handful of XML parts. Everything Domino
 * exports is a table of text, numbers and dates with no formulas and no
 * styling beyond column widths, so the subset needed here is small enough
 * to own outright — the same call made for the RSS parser and the MCP
 * endpoint (decided with Martin, 2026-08-31). No dependency, and the file
 * format stays auditable.
 *
 * Dates are written as real Excel serial numbers with a date format, not
 * as text, so a recipient can sort and filter them.
 */

export type CellValue = string | number | Date | null | undefined;

export type SheetColumn = {
  header: string;
  /** Approximate character width; Excel's own unit. */
  width?: number;
};

export type Sheet = {
  name: string;
  columns: SheetColumn[];
  rows: CellValue[][];
};

/* ------------------------------ XML bits ----------------------------- */

// Control characters Excel refuses outright; stripped rather than allowed
// to corrupt the file.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function escapeXml(value: string): string {
  return value
    .replace(CONTROL_CHARS, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Excel's serial date: days since 1899-12-30. */
function excelSerial(date: Date): number {
  const utcDays = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  return utcDays + 25_569;
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Sheet names may not exceed 31 characters or contain : \ / ? * [ ] */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Ark1").slice(0, 31);
}

function cellXml(reference: string, value: CellValue, styleId: number | null): string {
  const style = styleId === null ? "" : ` s="${styleId}"`;
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }
  if (value instanceof Date) {
    return `<c r="${reference}" s="2"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${reference}"${style}/>`;
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }
  // Inline strings: no shared-string table to keep in sync, and the size
  // difference is irrelevant for a report-sized sheet.
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns
    .map((column, index) => {
      const width = column.width ?? Math.min(Math.max(column.header.length + 4, 10), 60);
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const header = sheet.columns
    .map((column, index) => cellXml(`${columnName(index)}1`, column.header, 1))
    .join("");

  const body = sheet.rows
    .map((row, rowIndex) => {
      const number = rowIndex + 2;
      const cells = row
        .map((value, index) => cellXml(`${columnName(index)}${number}`, value, null))
        .join("");
      return `<row r="${number}">${cells}</row>`;
    })
    .join("");

  const lastColumn = columnName(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData><row r="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
}

function contentTypesXml(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbookRelsXml(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

/** Three styles: plain (0), bold header (1), date (2). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(names: string[]): string {
  const sheets = names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

/**
 * Excel refuses a workbook with two sheets of the same name, and names are
 * capped at 31 characters — so two long names can collide after trimming
 * even when they read as different. Numbering the duplicates keeps the file
 * openable instead of silently corrupt.
 */
function uniqueSheetNames(sheets: Sheet[]): string[] {
  const taken = new Set<string>();
  return sheets.map((sheet) => {
    const base = safeSheetName(sheet.name);
    let name = base;
    let n = 2;
    while (taken.has(name.toLowerCase())) {
      const suffix = ` ${n}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      n += 1;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

/* -------------------------------- ZIP -------------------------------- */

/**
 * The ZIP container, written by hand. Only what xlsx needs: deflated
 * entries, no directories, no zip64. Reports stay far below the 4 GB and
 * 65535-entry points where zip64 becomes necessary.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Buffer };

function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // modified time
    local.writeUInt16LE(0x21, 12); // modified date 1980-01-01: reproducible output
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/** Builds a workbook with one tab per sheet, in the order given. */
export function buildWorkbook(sheets: Sheet[]): Buffer {
  if (sheets.length === 0) throw new Error("buildWorkbook: a workbook needs at least one sheet");
  const names = uniqueSheetNames(sheets);

  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml(sheets.length), "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml(names), "utf8") },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(workbookRelsXml(sheets.length), "utf8"),
    },
    { name: "xl/styles.xml", data: Buffer.from(STYLES, "utf8") },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml({ ...sheet, name: names[i]! }), "utf8"),
    })),
  ]);
}

/** Builds a one-sheet workbook. */
export function buildXlsx(sheet: Sheet): Buffer {
  return buildWorkbook([sheet]);
}
