import { z } from "zod";
import { aiRead } from "@/modules/ai/read-route";
import { askForJson } from "@/modules/ai/service";
import { MAX_DESCRIPTION_CHARS, proposeFlow, type FlowProposal } from "@/modules/ai/propose-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The start screen's question: a description in, a whole flow out
 * (docs/adr/0008: a proposal is a read). Nothing is stored here; the
 * person sees the flow on the canvas and says yes through
 * createFlowAction, or does not.
 */
const Body = z.object({ description: z.string().trim().min(3).max(MAX_DESCRIPTION_CHARS) });

export async function POST(request: Request) {
  return aiRead<typeof Body, FlowProposal>(
    request,
    Body,
    async (ctx, input, locale) => {
      let engine = "";
      const proposal = await proposeFlow(input.description, locale, async (messages, options) => {
        const answer = await askForJson(ctx, "flow", messages, options);
        engine = answer.engine;
        return answer.data;
      });
      return { proposal, engine };
    },
    { requireModel: true },
  );
}
