"use client";

import { useTranslations } from "next-intl";
import { ArrowLeftIcon, DownloadIcon, MessageSquareIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { deleteFlowAction } from "@/modules/flow/actions";
import type { FlowDocument, PatchOp, Problem } from "@/modules/flow";
import { Link, useRouter } from "@/i18n/navigation";
import { AddBrickMenu } from "./add-brick-menu";
import { useDraft } from "./field-helpers";
import { HistorySheet } from "./history-sheet";

/**
 * The bar over the canvas: the way back, the flow's name (typed into,
 * committed on leaving), what is unfinished, and the actions — add a
 * brick, undo, history, export, delete. The name is a field in the
 * document like everything else, so renaming is a patch.
 */
export function FlowHeader({
  flowId,
  document,
  versionNumber,
  problems,
  selectedId,
  pending,
  chatOpen,
  onToggleChat,
  onCommit,
  onUndo,
  onRevert,
  onAdded,
}: {
  flowId: string;
  document: FlowDocument;
  versionNumber: number;
  problems: Problem[];
  selectedId: string | null;
  pending: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
  onCommit: (ops: PatchOp[], message: string) => Promise<boolean>;
  onUndo: () => void;
  onRevert: (versionId: string, number: number) => Promise<boolean>;
  onAdded: (id: string) => void;
}) {
  const t = useTranslations("flow.header");
  const router = useRouter();
  const name = useDraft(document.name, (next) => {
    const trimmed = next.trim();
    if (trimmed) void onCommit([{ op: "setMeta", name: trimmed }], t("messages.renamed"));
  });
  const warnings = problems.filter((p) => p.severity === "warning").length;

  return (
    <header className="border-border bg-card flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
      <Link
        href="/flows"
        className="text-secondary-foreground hover:bg-muted flex size-9 items-center justify-center rounded-md"
        aria-label={t("back")}
      >
        <ArrowLeftIcon className="size-4" />
      </Link>
      <Input
        aria-label={t("name")}
        value={name.draft}
        onChange={(e) => name.setDraft(e.target.value)}
        onBlur={name.commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-9 w-64 max-w-full border-transparent bg-transparent text-base font-semibold shadow-none hover:border-input focus-visible:border-input"
      />
      {warnings > 0 ? (
        <span className="bg-warning-tint text-warning rounded-full px-2.5 py-0.5 text-2sm font-medium">
          {t("unfinished", { count: warnings })}
        </span>
      ) : (
        <span className="bg-success-tint text-success rounded-full px-2.5 py-0.5 text-2sm font-medium">
          {t("ready")}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={chatOpen ? "secondary" : "outline"}
          size="sm"
          aria-pressed={chatOpen}
          onClick={onToggleChat}
        >
          <MessageSquareIcon data-icon="inline-start" />
          {t("chat")}
        </Button>
        <AddBrickMenu
          doc={document}
          selectedId={selectedId}
          disabled={pending}
          onAdd={async (ops, message, newId) => {
            if (await onCommit(ops, message)) onAdded(newId);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || versionNumber < 2}
          onClick={onUndo}
        >
          <Undo2Icon data-icon="inline-start" />
          {t("undo")}
        </Button>
        <HistorySheet flowId={flowId} currentNumber={versionNumber} onRevert={onRevert} />
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/api/flows/${flowId}/export`} download />}
        >
          <DownloadIcon data-icon="inline-start" />
          {t("export")}
        </Button>
        <ConfirmButton
          title={t("deleteTitle", { name: document.name })}
          body={t("deleteBody")}
          confirmLabel={t("deleteConfirm")}
          variant="ghost"
          onConfirm={async () => {
            const result = await deleteFlowAction({ flowId });
            if (!result.ok) {
              toast.error(t("deleteFailed"));
              return;
            }
            router.push("/flows");
          }}
        >
          {t("delete")}
        </ConfirmButton>
      </div>
    </header>
  );
}
