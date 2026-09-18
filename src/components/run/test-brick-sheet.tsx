"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toText, type Value } from "@/modules/engine";
import {
  inputPorts,
  PortIndex,
  type FileRef,
  type FlowDocument,
  type FlowNode,
} from "@/modules/flow";
import type { BrickTestResult } from "@/modules/runs/test-brick";
import { FileField } from "./file-field";

/**
 * One brick tried on its own (CLAUDE.md, never a black box). A field
 * per input, filled from what the last run carried there when there
 * was one; press play and see what the brick gives back — output per
 * port, tokens, or the error by name. Nothing is stored.
 */
type Given = Record<string, string | FileRef | undefined>;

export function TestBrickSheet({
  flowId,
  document,
  nodeId,
  onClose,
}: {
  flowId: string;
  document: FlowDocument;
  nodeId: string | null;
  onClose: () => void;
}) {
  const node = document.nodes.find((n) => n.id === nodeId) ?? null;
  return (
    <Sheet open={node !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[30rem]">
        {node ? (
          // Keyed on the brick, so opening another starts from a clean slate.
          <TestBrickForm key={node.id} flowId={flowId} document={document} node={node} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TestBrickForm({
  flowId,
  document,
  node,
}: {
  flowId: string;
  document: FlowDocument;
  node: FlowNode;
}) {
  const t = useTranslations("run.test");
  const tb = useTranslations("bricks");
  const [given, setGiven] = useState<Given>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BrickTestResult | null>(null);

  const index = new PortIndex(document);
  const ports = inputPorts(node).map((p) => ({
    name: p.name,
    kind: index.incomingKind(node.id, p.name)?.kind ?? p.kind?.kind ?? "text",
    from: index.edgeInto(node.id, p.name)?.from ?? null,
  }));

  // What the last run carried here, as a starting point.
  const nodeId = node.id;
  useEffect(() => {
    let alive = true;
    fetch(`/api/flows/${flowId}/test-brick?nodeId=${nodeId}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; inputs?: Record<string, Value> }>)
      .then((data) => {
        if (!alive || !data.ok || !data.inputs) return;
        const next: Given = {};
        for (const [port, value] of Object.entries(data.inputs)) {
          next[port] =
            typeof value === "object" && value !== null && "fileId" in value
              ? (value as FileRef)
              : typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2);
        }
        setGiven(next);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [flowId, nodeId]);

  const run = async () => {
    if (!node) return;
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch(`/api/flows/${flowId}/test-brick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, inputs: given }),
      });
      const data = (await response.json()) as { ok: boolean; result?: BrickTestResult };
      setResult(
        data.ok && data.result ? data.result : { ok: false, reason: "failed", error: t("failed") },
      );
    } catch {
      setResult({ ok: false, reason: "failed", error: t("failed") });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-5 py-5">
      <div className="flex flex-col gap-1">
        <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">
          {tb(`types.${node.type}`)}
        </p>
        <SheetTitle className="text-base font-semibold">
          {t("title", { title: node.title })}
        </SheetTitle>
        <p className="text-meta text-2sm">{loading ? t("loading") : t("subtitle")}</p>
      </div>

      {ports.length === 0 ? <p className="text-meta text-2sm">{t("noInputs")}</p> : null}
      {ports.map((port) => (
        <div key={port.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`test-${port.name}`}>
            {port.name}
            {port.from ? (
              <span className="text-meta font-normal">
                {" "}
                · {document.nodes.find((n) => n.id === port.from!.node)?.title}
              </span>
            ) : null}
          </Label>
          {port.kind === "file" ? (
            <FileField
              id={`test-${port.name}`}
              flowId={flowId}
              multiple={false}
              value={
                given[port.name] && typeof given[port.name] === "object"
                  ? [given[port.name] as FileRef]
                  : []
              }
              onChange={(refs) => setGiven({ ...given, [port.name]: refs[0] })}
            />
          ) : (
            <Textarea
              id={`test-${port.name}`}
              rows={5}
              value={typeof given[port.name] === "string" ? (given[port.name] as string) : ""}
              placeholder={port.kind === "json" ? t("jsonPlaceholder") : t("textPlaceholder")}
              onChange={(e) => setGiven({ ...given, [port.name]: e.target.value })}
              className="text-2sm"
            />
          )}
        </div>
      ))}

      <Button type="button" className="w-fit" disabled={running || loading} onClick={run}>
        <PlayIcon data-icon="inline-start" />
        {running ? t("running") : t("run")}
      </Button>

      {result ? (
        result.ok ? (
          <div className="flex flex-col gap-3">
            <p className="text-meta text-xs">
              {t("took", { ms: result.ms })}
              {result.tokensIn + result.tokensOut > 0
                ? ` · ${t("tokens", { in: result.tokensIn, out: result.tokensOut })}`
                : ""}
            </p>
            {Object.entries(result.outputs).map(([port, value]) => (
              <div key={port} className="flex flex-col gap-1">
                <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">
                  {port}
                </p>
                <pre className="bg-background max-h-80 overflow-auto rounded-md px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                  {toText(value)}
                </pre>
              </div>
            ))}
            {Object.keys(result.outputs).length === 0 ? (
              <p className="text-meta text-2sm">{t("nothing")}</p>
            ) : null}
          </div>
        ) : (
          <div className="bg-warning-tint text-warning rounded-md px-3 py-2 text-2sm">
            <p className="font-semibold">{t("failedTitle")}</p>
            <p className="mt-1 whitespace-pre-wrap">
              {result.reason === "ceiling" ? t("ceiling") : result.error}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
