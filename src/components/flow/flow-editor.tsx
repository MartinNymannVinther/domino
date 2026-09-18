"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { FlowCanvas } from "@/components/canvas/flow-canvas";
import type { FlowDocument } from "@/modules/flow";
import { BrickPanel } from "./brick-panel";
import { FlowHeader } from "./flow-header";
import { connectOps, connectionAllowed, removeOps } from "./patches";
import { useFlowEditor, type EditorVersion } from "./use-flow-editor";

/**
 * The flow page: header, canvas, panel (CLAUDE.md, product principles).
 * The editor owns the document and turns every gesture into a patch;
 * the canvas draws and the panel edits, neither holds state of its own
 * beyond what is being typed.
 */
export function FlowEditor({
  flowId,
  initial,
}: {
  flowId: string;
  initial: { document: FlowDocument; version: EditorVersion };
}) {
  const t = useTranslations("flow.editor");
  const editor = useFlowEditor(flowId, initial);
  const { document, problems, selectedId, setSelectedId, commit } = editor;
  const selected = useMemo(
    () => document.nodes.find((n) => n.id === selectedId) ?? null,
    [document, selectedId],
  );

  const onConnect = useCallback(
    (c: { source: string; sourceHandle: string; target: string; targetHandle: string }) => {
      const ops = connectOps(document, c);
      if (ops) void commit(ops, t("messages.connected"));
    },
    [commit, document, t],
  );

  const onDelete = useCallback(
    (ids: { nodes: string[]; edges: string[] }) => {
      const ops = removeOps(document, ids);
      if (ops.length) {
        void commit(ops, t("messages.removed"));
        if (ids.nodes.includes(selectedId ?? "") || ids.edges.includes(selectedId ?? ""))
          setSelectedId(null);
      }
    },
    [commit, document, selectedId, setSelectedId, t],
  );

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <FlowHeader
        flowId={flowId}
        document={document}
        versionNumber={editor.version.number}
        problems={problems}
        selectedId={selectedId}
        pending={editor.pending}
        onCommit={commit}
        onUndo={() => void editor.undo(t("messages.undone"))}
        onRevert={(versionId, number) =>
          editor.revert(versionId, t("messages.reverted", { number }))
        }
        onAdded={setSelectedId}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-[60svh] flex-1 lg:min-h-0">
          <FlowCanvas
            document={document}
            problems={problems}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onConnect={onConnect}
            onDelete={onDelete}
            isValidConnection={(c) => connectionAllowed(document, c)}
            readOnly={editor.pending}
          />
        </div>
        {selected ? (
          <BrickPanel
            key={selected.id}
            doc={document}
            node={selected}
            problems={problems}
            onCommit={(ops, message) => void commit(ops, message)}
            onClose={() => setSelectedId(null)}
            readOnly={editor.pending}
          />
        ) : null}
      </div>
    </div>
  );
}
