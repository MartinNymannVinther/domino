import { and, count, eq, gt, sql } from "drizzle-orm";
import { aiCalls } from "@/core/db/schema";
import type { AppTransaction, OrgContext } from "@/core/db/tenant";
import { env } from "@/core/env";

/**
 * Ceilings on the AI surface. A model call costs money on a hosted
 * installation and minutes on a local one, and a prompt built from a
 * card is a prompt that will one day be built from a card holding a
 * novel. The numbers are generous for a person and mean for a script.
 *
 * Three of them, and the third is a different kind (docs/adr/0035). The
 * first two are counted inside the tenant context, so they see one
 * workspace and answer for it: a person in three workspaces has three
 * times the first, and an installation with a thousand workspaces has a
 * thousand times the second. The third is the installation's own roof,
 * counted across every workspace, and it is what stands between a
 * `DEMO=on` front door and a model bill nobody chose.
 */
export const MAX_INPUT_CHARS = 6000;
export const MAX_CALLS_PER_USER_PER_HOUR = 60;
export const MAX_CALLS_PER_WORKSPACE_PER_DAY = 600;
/** Set by the installation (AI_DAILY_CALL_CAP); 0 means no roof at all. */
export const MAX_CALLS_PER_INSTALLATION_PER_DAY = env.AI_DAILY_CALL_CAP;

export type AiKind =
  | "draft"
  | "split"
  | "summary"
  | "bootstrap"
  | "doneWhen"
  | "assist"
  | "goal"
  | "close"
  | "review"
  | "test"
  | "flow"
  | "change"
  | "brick"
  | "run";

export class RateLimited extends Error {
  constructor() {
    super("rate limited");
    this.name = "RateLimited";
  }
}

/**
 * Counts the call, or refuses it when the caller, the workspace or the
 * installation is over the line. Called before the model is asked, never
 * after, so a refusal costs nothing but a row that is not written.
 *
 * The caller's own ceilings are checked first: they are index lookups,
 * they name the caller's own doing, and checking them first means the
 * count across every workspace is only paid for by a call that would
 * otherwise have been allowed.
 *
 * All three are ceilings, not quotas. Two calls landing at the same
 * moment can both read the count below the line and both be let through,
 * which overshoots by the number of calls in flight and never by more.
 * Serialising the whole AI surface to close that would cost every user a
 * queue to save an installation a handful of calls.
 */
export async function reserveAiCall(
  tx: AppTransaction,
  ctx: OrgContext,
  kind: AiKind,
  engine: string,
): Promise<void> {
  const [perUser] = await tx
    .select({ n: count() })
    .from(aiCalls)
    .where(
      and(eq(aiCalls.userId, ctx.userId), gt(aiCalls.createdAt, sql`now() - interval '1 hour'`)),
    );
  if (Number(perUser?.n ?? 0) >= MAX_CALLS_PER_USER_PER_HOUR) throw new RateLimited();
  const [perOrg] = await tx
    .select({ n: count() })
    .from(aiCalls)
    .where(and(eq(aiCalls.orgId, ctx.orgId), gt(aiCalls.createdAt, sql`now() - interval '1 day'`)));
  if (Number(perOrg?.n ?? 0) >= MAX_CALLS_PER_WORKSPACE_PER_DAY) throw new RateLimited();
  if (MAX_CALLS_PER_INSTALLATION_PER_DAY > 0) {
    // The one count that has to see past this workspace, and the only way
    // it is allowed to: a definer's-rights function that returns the
    // number and never a row (drizzle/0015, docs/adr/0035). A plain count
    // here would read one workspace's rows under RLS and always agree
    // that the installation was fine.
    const result = await tx.execute(sql`select ai_calls_last_day() as n`);
    // count(*) is a bigint, which pg hands back as a string. A number that
    // cannot be read is treated as over the roof: for a ceiling on spend,
    // "unknown" must not be allowed to mean "fine".
    const [row] = result.rows as Array<{ n?: string | number | null }>;
    const total = Number(row?.n);
    if (!Number.isFinite(total) || total >= MAX_CALLS_PER_INSTALLATION_PER_DAY)
      throw new RateLimited();
  }
  await tx.insert(aiCalls).values({ orgId: ctx.orgId, userId: ctx.userId, kind, engine });
}

/**
 * A run's model calls (docs/adr/0013): counted against the workspace's
 * day and the installation's roof, never against the person's hour. The
 * hourly ceiling is sized for a person typing; a pile of two hundred
 * documents is a pile, chosen once, and the run's own ceilings bound it.
 */
export async function reserveRunCall(
  tx: AppTransaction,
  ctx: OrgContext,
  engine: string,
): Promise<void> {
  const [perOrg] = await tx
    .select({ n: count() })
    .from(aiCalls)
    .where(and(eq(aiCalls.orgId, ctx.orgId), gt(aiCalls.createdAt, sql`now() - interval '1 day'`)));
  if (Number(perOrg?.n ?? 0) >= MAX_CALLS_PER_WORKSPACE_PER_DAY) throw new RateLimited();
  if (MAX_CALLS_PER_INSTALLATION_PER_DAY > 0) {
    const result = await tx.execute(sql`select ai_calls_last_day() as n`);
    const [row] = result.rows as Array<{ n?: string | number | null }>;
    const total = Number(row?.n);
    if (!Number.isFinite(total) || total >= MAX_CALLS_PER_INSTALLATION_PER_DAY)
      throw new RateLimited();
  }
  await tx.insert(aiCalls).values({ orgId: ctx.orgId, userId: ctx.userId, kind: "run", engine });
}

/** Trims and caps user text before it goes anywhere near a prompt. */
export function capText(text: unknown, max: number): string {
  return typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}
