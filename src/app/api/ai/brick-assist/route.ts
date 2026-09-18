import { z } from "zod";
import {
  MAX_EXAMPLE_CHARS,
  proposePrompt,
  proposeSchema,
  type SchemaProposal,
  type TextProposal,
} from "@/modules/ai/brick-assist";
import { aiRead } from "@/modules/ai/read-route";
import { askForJson } from "@/modules/ai/service";
import { getFlow } from "@/modules/flow/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The AI per brick (docs/adr/0008): finish this prompt, or propose a
 * schema from an example of the data. A proposal comes back to the
 * panel; the person applies it, or does not.
 */
const Body = z.discriminatedUnion("ask", [
  z.object({
    ask: z.literal("prompt"),
    flowId: z.string().min(1).max(64),
    nodeId: z.string().min(1).max(32),
  }),
  z.object({
    ask: z.literal("schema"),
    example: z.string().trim().min(1).max(MAX_EXAMPLE_CHARS),
    hint: z.string().trim().max(1000).default(""),
  }),
]);

export async function POST(request: Request) {
  return aiRead<typeof Body, TextProposal | SchemaProposal>(
    request,
    Body,
    async (ctx, input, locale) => {
      let engine = "";
      const ask = async (
        messages: Parameters<typeof askForJson>[2],
        options: { maxTokens: number },
      ) => {
        const answer = await askForJson(ctx, "brick", messages, options);
        engine = answer.engine;
        return answer.data;
      };
      if (input.ask === "prompt") {
        const flow = await getFlow(ctx, input.flowId);
        if (!flow) return null;
        const proposal = await proposePrompt(flow.document, input.nodeId, locale, ask);
        return proposal ? { proposal, engine } : null;
      }
      return { proposal: await proposeSchema(input.example, input.hint, locale, ask), engine };
    },
    { requireModel: true },
  );
}
