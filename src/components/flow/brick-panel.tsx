"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { FlowDocument, FlowNode, PatchOp, Problem } from "@/modules/flow";
import { cn } from "@/lib/utils";
import {
  BranchForm,
  CombineForm,
  DocumentForm,
  InputForm,
  LoopForm,
  OutputForm,
} from "./brick-forms";
import { ConnectionsForm } from "./connections-form";
import { TextField } from "./field-helpers";
import { reconnectOps, removeOps, updateConfigOps } from "./patches";
import { LlmForm, StructuredForm, TemplateForm } from "./prompt-forms";

/**
 * The right-hand panel: the selected brick's settings (CLAUDE.md,
 * product principles). The title, the type's own form, the
 * connections, what is wrong with it, and the way to remove it. Every
 * change leaves as a list of operations; the editor commits them.
 */
export function BrickPanel({
  flowId,
  doc,
  node,
  problems,
  withAi,
  onCommit,
  onClose,
  readOnly,
}: {
  flowId: string;
  doc: FlowDocument;
  node: FlowNode;
  problems: Problem[];
  withAi: boolean;
  onCommit: (ops: PatchOp[], message: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("flow.panel");
  const tb = useTranslations("bricks");
  const tp = useTranslations("flow.problems");
  const mine = problems.filter((p) => p.nodeId === node.id);
  const change = (config: FlowNode["config"]) =>
    onCommit(updateConfigOps(doc, node.id, config), t("messages.settings", { title: node.title }));

  return (
    <aside
      aria-label={t("label")}
      className={cn(
        "bg-card border-border flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-l px-5 py-5 lg:w-[22rem]",
        readOnly && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-label text-[11px] font-medium tracking-[0.04em] uppercase">
            {tb(`types.${node.type}`)}
          </p>
          <p className="text-meta text-2sm">{tb(`about.${node.type}`)}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("close")}
        </Button>
      </div>

      <TextField
        label={t("title")}
        value={node.title}
        onCommit={(title) =>
          onCommit([{ op: "updateNode", id: node.id, title }], t("messages.renamed", { title }))
        }
      />

      {node.type === "input" ? <InputForm node={node} onChange={change} /> : null}
      {node.type === "llm" ? (
        <LlmForm node={node} doc={doc} flowId={flowId} withAi={withAi} onChange={change} />
      ) : null}
      {node.type === "structured" ? (
        <StructuredForm node={node} doc={doc} flowId={flowId} withAi={withAi} onChange={change} />
      ) : null}
      {node.type === "document" ? <DocumentForm node={node} onChange={change} /> : null}
      {node.type === "branch" ? <BranchForm node={node} onChange={change} /> : null}
      {node.type === "loop_start" || node.type === "loop_end" ? (
        <LoopForm node={node} onChange={change} />
      ) : null}
      {node.type === "combine" ? <CombineForm node={node} onChange={change} /> : null}
      {node.type === "template" ? (
        <TemplateForm node={node} doc={doc} flowId={flowId} withAi={withAi} onChange={change} />
      ) : null}
      {node.type === "output" ? <OutputForm node={node} onChange={change} /> : null}

      <ConnectionsForm
        doc={doc}
        node={node}
        onReconnect={(port, from) =>
          onCommit(
            reconnectOps(doc, node.id, port, from),
            t("messages.connected", { title: node.title }),
          )
        }
      />

      {mine.length > 0 ? (
        <div className="bg-warning-tint text-warning flex flex-col gap-1 rounded-md px-3 py-2 text-2sm">
          {mine.map((p, i) => (
            <p key={i}>{tp(`codes.${p.code}`, { port: p.port ?? "" })}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-auto pt-2">
        <ConfirmButton
          title={t("removeTitle", { title: node.title })}
          body={t("removeBody")}
          confirmLabel={t("removeConfirm")}
          onConfirm={() =>
            onCommit(
              removeOps(doc, { nodes: [node.id], edges: [] }),
              t("messages.removed", { title: node.title }),
            )
          }
        >
          {t("remove")}
        </ConfirmButton>
      </div>
    </aside>
  );
}
