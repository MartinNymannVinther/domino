"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { applyPatch, validateDocument, type FlowDocument, type PatchOp } from "@/modules/flow";
import { commitPatchAction, revertAction, undoAction } from "@/modules/flow/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * The editor's one piece of state: the document at a version. Every
 * change is a list of operations tried here first — so a refused one
 * costs no round trip — then sent as a patch against the version in
 * hand, and the answer is the next version. A conflict means somebody
 * else moved the flow on; the page is reloaded and the person tries
 * again on what is there now.
 */

export type EditorVersion = { id: string; number: number };

export function useFlowEditor(
  flowId: string,
  initial: { document: FlowDocument; version: EditorVersion },
) {
  const t = useTranslations("flow.editor");
  const router = useRouter();
  const [document, setDocument] = useState(initial.document);
  const [version, setVersion] = useState(initial.version);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const problems = useMemo(() => validateDocument(document), [document]);

  const commit = useCallback(
    (ops: PatchOp[], message: string): Promise<boolean> => {
      if (ops.length === 0) return Promise.resolve(true);
      const trial = applyPatch(document, { ops });
      if (!trial.ok) {
        toast.error(trial.problems[0]?.message ?? t("refused"));
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        startTransition(async () => {
          const result = await commitPatchAction({
            flowId,
            baseVersionId: version.id,
            patch: { ops },
            message,
          });
          if (!result.ok) {
            if (result.error === "conflict") {
              toast.error(t("conflict"));
              router.refresh();
            } else {
              toast.error(result.problems?.[0]?.message ?? t("refused"));
            }
            resolve(false);
            return;
          }
          setDocument(result.data.document);
          setVersion({ id: result.data.versionId, number: result.data.number });
          resolve(true);
        });
      });
    },
    [document, flowId, router, t, version.id],
  );

  const revert = useCallback(
    (versionId: string, message: string): Promise<boolean> =>
      new Promise((resolve) => {
        startTransition(async () => {
          const result = await revertAction({ flowId, versionId, message });
          if (!result.ok) {
            toast.error(t("refused"));
            resolve(false);
            return;
          }
          setDocument(result.data.document);
          setVersion({ id: result.data.versionId, number: result.data.number });
          resolve(true);
        });
      }),
    [flowId, t],
  );

  const undo = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        startTransition(async () => {
          const result = await undoAction({ flowId, currentNumber: version.number, message });
          if (!result.ok) {
            toast.error(t("refused"));
            resolve(false);
            return;
          }
          setDocument(result.data.document);
          setVersion({ id: result.data.versionId, number: result.data.number });
          resolve(true);
        });
      }),
    [flowId, t, version.number],
  );

  /** What arrived from the server after a reload or a proposal, taken as the new truth. */
  const replace = useCallback((next: { document: FlowDocument; version: EditorVersion }) => {
    setDocument(next.document);
    setVersion(next.version);
  }, []);

  return {
    document,
    version,
    problems,
    selectedId,
    setSelectedId,
    pending,
    commit,
    revert,
    undo,
    replace,
  };
}

export type FlowEditorState = ReturnType<typeof useFlowEditor>;
