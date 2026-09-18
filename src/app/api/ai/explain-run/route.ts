import { z } from "zod";
import { explainFailure, type Explanation } from "@/modules/ai/brick-assist";
import { aiRead } from "@/modules/ai/read-route";
import { askForJson } from "@/modules/ai/service";
import { getFlow } from "@/modules/flow/service";
import { getRun } from "@/modules/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A failed run, explained (docs/adr/0008): what went wrong at the brick
 * that failed, in plain words, with a fix as a patch when there is one
 * — judged against the flow as it is now, and applied only when the
 * person accepts it on the run page.
 */
const Body = z.object({ runId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  return aiRead<typeof Body, Explanation & { baseVersionId: string; flowId: string }>(
    request,
    Body,
    async (ctx, input, locale) => {
      const run = await getRun(ctx, input.runId);
      if (!run || run.status !== "failed" || !run.error) return null;
      const flow = await getFlow(ctx, run.flowId);
      if (!flow) return null;
      const failed = run.steps.find((s) => s.status === "failed") ?? run.steps.at(-1);
      let engine = "";
      const explanation = await explainFailure(
        flow.document,
        run.document,
        {
          nodeId: failed?.nodeId ?? "",
          iteration: failed?.iteration ?? 0,
          input: failed?.input ?? null,
          error: failed?.error ?? run.error,
        },
        run.error,
        locale,
        async (messages, options) => {
          const answer = await askForJson(ctx, "brick", messages, options);
          engine = answer.engine;
          return answer.data;
        },
      );
      return {
        proposal: { ...explanation, baseVersionId: flow.version.id, flowId: flow.id },
        engine,
      };
    },
    { requireModel: true },
  );
}
