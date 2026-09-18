"use client";

import { useTranslations } from "next-intl";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toText } from "@/modules/engine";
import { PortIndex } from "@/modules/flow";
import { tableRows } from "@/modules/runs/table";
import type { RunJson } from "./run-view";

/**
 * What the run was for: every output brick, as text, as a table with
 * the schema's fields for columns and a spreadsheet to take away, or as
 * the structure it is.
 */
export function OutputView({ run }: { run: RunJson }) {
  const t = useTranslations("run.output");
  const outputs = run.document.nodes.filter((n) => n.type === "output");
  const index = new PortIndex(run.document);
  return (
    <section className="flex flex-col gap-4">
      {outputs.map((node) => {
        if (node.type !== "output") return null;
        const value = run.output?.[node.id];
        return (
          <div
            key={node.id}
            className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{node.config.label}</h2>
              {node.config.kind === "table" ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={`/api/runs/${run.id}/output/${node.id}`} download />}
                >
                  <DownloadIcon data-icon="inline-start" />
                  {t("spreadsheet")}
                </Button>
              ) : null}
            </div>
            {value === null || value === undefined ? (
              <p className="text-meta text-2sm">{t("nothing")}</p>
            ) : node.config.kind === "table" ? (
              <OutputTable value={value} columns={index.tableColumns(node.id)} />
            ) : node.config.kind === "text" ? (
              <Markdown source={toText(value as never)} />
            ) : (
              <pre className="bg-background max-h-96 overflow-auto rounded-md px-3 py-2 text-xs leading-relaxed">
                {JSON.stringify(value, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </section>
  );
}

function OutputTable({ value, columns }: { value: unknown; columns: string[] | null }) {
  const table = tableRows(value, columns);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j} className="max-w-md align-top whitespace-pre-wrap">
                  {cell === null || cell === undefined ? "" : String(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
