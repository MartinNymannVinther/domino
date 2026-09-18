import { z } from "zod";
import { aiRead } from "@/modules/ai/read-route";
import { askForJson } from "@/modules/ai/service";
import { MAX_MESSAGE_CHARS, proposeChange, type ChangeProposal } from "@/modules/ai/propose-change";
import { listMessages } from "@/modules/flow/messages";
import { getFlow } from "@/modules/flow/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A turn in the conversation about a flow: the person's line in, the
 * model's reply and its proposed patch out (docs/adr/0008). The
 * exchange is stored afterwards by recordExchangeAction, and the patch
 * becomes a version only when accepted.
 */
const Body = z.object({
  flowId: z.string().min(1).max(64),
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

export async function POST(request: Request) {
  return aiRead<typeof Body, ChangeProposal & { baseVersionId: string }>(
    request,
    Body,
    async (ctx, input, locale) => {
      const flow = await getFlow(ctx, input.flowId);
      if (!flow) return null;
      const history = (await listMessages(ctx, input.flowId)).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      let engine = "";
      const proposal = await proposeChange(
        flow.document,
        history,
        input.message,
        locale,
        async (messages, options) => {
          const answer = await askForJson(ctx, "change", messages, options);
          engine = answer.engine;
          return answer.data;
        },
      );
      return { proposal: { ...proposal, baseVersionId: flow.version.id }, engine };
    },
    { requireModel: true },
  );
}
