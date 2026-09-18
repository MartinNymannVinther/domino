"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SendHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { askAi } from "@/modules/ai/read-client";
import type { ChangeProposal } from "@/modules/ai/propose-change";
import type { AiFailure } from "@/modules/ai/wire";
import { recordExchangeAction } from "@/modules/flow/actions-chat";
import type { FlowMessage } from "@/modules/flow/messages";
import { cn } from "@/lib/utils";

/**
 * The conversation beside the canvas (CLAUDE.md, product principles).
 * A line goes to the model with the flow as it is; the answer comes
 * back with a proposal, is stored as the exchange it was, and is drawn
 * on the canvas as a diff for the person to accept or turn down. The
 * model never writes to the flow from here; accepting does.
 */
export type ChatMessage = Pick<
  FlowMessage,
  "id" | "role" | "content" | "proposal" | "proposalStatus"
>;

export function ChatPanel({
  flowId,
  messages,
  modelConfigured,
  pendingId,
  busy,
  onExchange,
  onAccept,
  onReject,
}: {
  flowId: string;
  messages: ChatMessage[];
  modelConfigured: boolean;
  /** The proposal the canvas is showing, if any. */
  pendingId: string | null;
  busy: boolean;
  onExchange: (message: ChatMessage[]) => void;
  onAccept: (messageId: string) => Promise<boolean>;
  onReject: (messageId: string) => Promise<boolean>;
}) {
  const t = useTranslations("flow.chat");
  const locale = useLocale();
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, asking]);

  const send = async () => {
    const message = draft.trim();
    if (!message || asking) return;
    setAsking(true);
    const result = await askAi<ChangeProposal & { baseVersionId: string }>(
      "flow-chat",
      { flowId, message },
      { locale },
    );
    if (!result.ok) {
      toast.error(
        t(`failed.${result.error as AiFailure | "invalid" | "notFound" | "unauthorized"}`),
      );
      setAsking(false);
      return;
    }
    const proposal = result.proposal;
    const assistant = proposal.ok ? proposal.reply || t("noReply") : t("couldNot");
    const stored = await recordExchangeAction({
      flowId,
      user: message,
      assistant,
      engine: result.engine,
      proposal:
        proposal.ok && proposal.patch
          ? { baseVersionId: proposal.baseVersionId, patch: proposal.patch }
          : null,
    });
    setAsking(false);
    if (!stored.ok) {
      toast.error(t("failed.generic"));
      return;
    }
    setDraft("");
    onExchange([
      {
        id: `${stored.data.assistantId}-u`,
        role: "user",
        content: message,
        proposal: null,
        proposalStatus: null,
      },
      {
        id: stored.data.assistantId,
        role: "assistant",
        content: assistant,
        proposal:
          proposal.ok && proposal.patch
            ? { baseVersionId: proposal.baseVersionId, patch: proposal.patch }
            : null,
        proposalStatus: proposal.ok && proposal.patch ? "proposed" : null,
      },
    ]);
  };

  return (
    <section
      aria-label={t("label")}
      className="bg-card border-border flex w-full shrink-0 flex-col border-r lg:w-[22rem]"
    >
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-meta text-2sm leading-relaxed">{t("empty")}</p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg px-3 py-2 text-2sm leading-relaxed",
              m.role === "user" ? "bg-secondary self-end" : "bg-background border-border border",
            )}
          >
            {m.role === "assistant" ? (
              <Markdown source={m.content} className="gap-2 text-2sm" />
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
            {m.proposal ? (
              <ProposalActions
                status={m.proposalStatus}
                showing={m.id === pendingId}
                busy={busy}
                onAccept={() => onAccept(m.id)}
                onReject={() => onReject(m.id)}
              />
            ) : null}
          </div>
        ))}
        {asking ? <p className="text-meta text-2sm">{t("thinking")}</p> : null}
      </div>
      <form
        className="border-border flex flex-col gap-2 border-t px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={modelConfigured ? t("placeholder") : t("noModel")}
          disabled={!modelConfigured || asking || pendingId !== null}
          aria-label={t("inputLabel")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta text-xs">{pendingId ? t("decideFirst") : t("hint")}</p>
          <Button
            type="submit"
            size="sm"
            disabled={!modelConfigured || asking || !draft.trim() || pendingId !== null}
          >
            <SendHorizontalIcon data-icon="inline-start" />
            {t("send")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ProposalActions({
  status,
  showing,
  busy,
  onAccept,
  onReject,
}: {
  status: FlowMessage["proposalStatus"];
  showing: boolean;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useTranslations("flow.chat");
  if (status === "accepted") return <p className="text-success text-xs">{t("accepted")}</p>;
  if (status === "rejected") return <p className="text-meta text-xs">{t("rejected")}</p>;
  if (!showing) return <p className="text-meta text-xs">{t("proposed")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="xs" disabled={busy} onClick={onAccept}>
        {t("accept")}
      </Button>
      <Button type="button" size="xs" variant="outline" disabled={busy} onClick={onReject}>
        {t("reject")}
      </Button>
      <span className="text-meta text-xs">{t("showing")}</span>
    </div>
  );
}
