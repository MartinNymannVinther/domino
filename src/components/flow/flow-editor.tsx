"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FlowCanvas } from "@/components/canvas/flow-canvas";
import { ChatPanel, type ChatMessage } from "@/components/chat/chat-panel";
import { validateDocument, type FlowDocument } from "@/modules/flow";
import { acceptProposalAction, rejectProposalAction } from "@/modules/flow/actions-chat";
import { BrickPanel } from "./brick-panel";
import { FlowHeader } from "./flow-header";
import { connectOps, connectionAllowed, removeOps } from "./patches";
import { previewProposal } from "./proposal-preview";
import { useFlowEditor, type EditorVersion } from "./use-flow-editor";

/**
 * The flow page: conversation, canvas, panel (CLAUDE.md, product
 * principles). The editor owns the document and turns every gesture
 * into a patch; the canvas draws and the panel edits. While the model
 * has proposed something, the canvas shows the proposal as a diff and
 * the flow waits for a yes or a no before anything else changes.
 */
export function FlowEditor({
  flowId,
  initial,
  modelConfigured,
}: {
  flowId: string;
  initial: { document: FlowDocument; version: EditorVersion; messages: ChatMessage[] };
  modelConfigured: boolean;
}) {
  const t = useTranslations("flow.editor");
  const editor = useFlowEditor(flowId, initial);
  const { document, problems, selectedId, setSelectedId, commit } = editor;
  const [messages, setMessages] = useState(initial.messages);
  const [chatOpen, setChatOpen] = useState(modelConfigured || initial.messages.length > 0);
  const [deciding, setDeciding] = useState(false);

  // The newest proposal still waiting, drawn on the canvas as a diff.
  const pending = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (m) =>
            m.proposal &&
            m.proposalStatus === "proposed" &&
            m.proposal.baseVersionId === editor.version.id,
        ) ?? null,
    [messages, editor.version.id],
  );
  const preview = useMemo(
    () => (pending?.proposal ? previewProposal(document, pending.proposal.patch) : null),
    [document, pending],
  );
  const shown = preview?.document ?? document;
  const shownProblems = useMemo(
    () => (preview ? validateDocument(preview.document) : problems),
    [preview, problems],
  );
  const frozen = editor.pending || preview !== null;

  const selected = useMemo(
    () => shown.nodes.find((n) => n.id === selectedId) ?? null,
    [shown, selectedId],
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

  const setStatus = (messageId: string, status: "accepted" | "rejected") =>
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, proposalStatus: status } : m)),
    );

  const accept = async (messageId: string) => {
    setDeciding(true);
    const result = await acceptProposalAction({ flowId, messageId });
    setDeciding(false);
    if (!result.ok) {
      toast.error(result.error === "conflict" ? t("conflict") : t("refused"));
      if (result.error === "conflict") setStatus(messageId, "rejected");
      return false;
    }
    editor.replace({
      document: result.data.document,
      version: { id: result.data.versionId, number: result.data.number },
    });
    setStatus(messageId, "accepted");
    return true;
  };

  const reject = async (messageId: string) => {
    setDeciding(true);
    const result = await rejectProposalAction({ flowId, messageId });
    setDeciding(false);
    if (!result.ok) {
      toast.error(t("refused"));
      return false;
    }
    setStatus(messageId, "rejected");
    return true;
  };

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <FlowHeader
        flowId={flowId}
        document={document}
        versionNumber={editor.version.number}
        problems={problems}
        selectedId={selectedId}
        pending={frozen}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
        onCommit={commit}
        onUndo={() => void editor.undo(t("messages.undone"))}
        onRevert={(versionId, number) =>
          editor.revert(versionId, t("messages.reverted", { number }))
        }
        onAdded={setSelectedId}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {chatOpen ? (
          <ChatPanel
            flowId={flowId}
            messages={messages}
            modelConfigured={modelConfigured}
            pendingId={pending?.id ?? null}
            busy={deciding || editor.pending}
            onExchange={(added) => setMessages((prev) => [...prev, ...added])}
            onAccept={accept}
            onReject={reject}
          />
        ) : null}
        <div className="min-h-[60svh] flex-1 lg:min-h-0">
          <FlowCanvas
            document={shown}
            problems={shownProblems}
            marks={preview?.marks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onConnect={onConnect}
            onDelete={onDelete}
            isValidConnection={(c) => !frozen && connectionAllowed(document, c)}
            readOnly={frozen}
          />
        </div>
        {selected ? (
          <BrickPanel
            key={selected.id}
            doc={shown}
            node={selected}
            problems={shownProblems}
            onCommit={(ops, message) => void commit(ops, message)}
            onClose={() => setSelectedId(null)}
            readOnly={frozen}
          />
        ) : null}
      </div>
    </div>
  );
}
