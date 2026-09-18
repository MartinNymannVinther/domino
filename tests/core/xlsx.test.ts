import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/core/xlsx";

/**
 * The writer is ours, so "it looks right" is not evidence. Every test here
 * takes the bytes apart again: the ZIP is unpacked by a reader that did
 * not write it, which validates the central directory, the local headers
 * and every CRC, and the cell values are read back out of the XML. A file
 * Excel could not open fails here first.
 */

function unzip(buffer: Buffer): (name: string) => string {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  const file = join(dir, "sheet.xlsx");
  writeFileSync(file, buffer);
  execFileSync("python3", [
    "-c",
    "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;z.extractall(sys.argv[2])",
    file,
    dir,
  ]);
  return (name: string) => readFileSync(join(dir, name), "utf8");
}

const sheet = {
  name: "Timer",
  columns: [{ header: "Dato" }, { header: "Kunde" }, { header: "Timer" }],
  rows: [
    [new Date(2026, 0, 30), "Eksempel A-kasse", 7.5],
    [new Date(2026, 7, 3), "Rasmus & Sønner <A/S>", 8],
    [null, "Uden dato", 0],
  ],
};

describe("buildXlsx", () => {
  it("writes a zip an independent reader accepts, with the parts xlsx requires", () => {
    const read = unzip(buildXlsx(sheet));
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(read(part).length, part).toBeGreaterThan(0);
    }
  });

  it("puts the headers and values in the cells they belong in", () => {
    const xml = unzip(buildXlsx(sheet))("xl/worksheets/sheet1.xml");
    expect(xml).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Dato</t></is></c>',
    );
    expect(xml).toContain('<t xml:space="preserve">Eksempel A-kasse</t>');
    expect(xml).toContain('<c r="C2"><v>7.5</v></c>');
    expect(xml).toContain('<c r="C4"><v>0</v></c>');
  });

  it("writes dates as Excel serials, so they sort as dates and not as text", () => {
    const xml = unzip(buildXlsx(sheet))("xl/worksheets/sheet1.xml");
    // 30 January 2026 is serial 46052; style 2 carries the date format.
    expect(xml).toContain('<c r="A2" s="2"><v>46052</v></c>');
    expect(xml).toContain('<c r="A4"/>');
  });

  it("escapes the characters that would otherwise break the XML", () => {
    const xml = unzip(buildXlsx(sheet))("xl/worksheets/sheet1.xml");
    expect(xml).toContain("Rasmus &amp; Sønner &lt;A/S&gt;");
    expect(xml).not.toContain("<A/S>");
  });

  it("strips control characters rather than writing a file Excel refuses", () => {
    const xml = unzip(
      buildXlsx({
        name: "Timer",
        columns: [{ header: "Note" }],
        rows: [["f\u00f8r\u0007efter"]],
      }),
    )("xl/worksheets/sheet1.xml");
    expect(xml).toContain("førefter");
  });

  it("trims a sheet name Excel would reject", () => {
    const xml = unzip(
      buildXlsx({
        name: "Rapport: 2026/2027 [udkast] som er alt for lang til et faneblad",
        columns: [{ header: "A" }],
        rows: [],
      }),
    )("xl/workbook.xml");
    const name = /name="([^"]*)"/.exec(xml)?.[1] ?? "";
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it("handles a sheet wider than 26 columns", () => {
    const columns = Array.from({ length: 30 }, (_, i) => ({ header: `K${i}` }));
    const xml = unzip(buildXlsx({ name: "Bred", columns, rows: [columns.map((_, i) => i)] }))(
      "xl/worksheets/sheet1.xml",
    );
    expect(xml).toContain('r="AA1"');
    expect(xml).toContain('<c r="AD2"><v>29</v></c>');
  });
});
