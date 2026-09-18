import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import type { OrgContext } from "@/core/db/tenant";
import { routing, type Locale } from "@/i18n/routing";
import { classifyAiError, modelConfigured } from "./service";
import type { ProposalResult } from "./wire";

/**
 * One door for the AI's read-only proposals (docs/adr/0034).
 *
 * The quiet assists read a state and answer with a proposal; they write
 * no row. They used to be server actions, and Next runs server actions
 * from one client strictly one at a time — so a model that thought for
 * twenty seconds held back the card the person added in the meantime. A
 * read belongs on a route, outside that queue, where the person's own
 * writes overtake it and a fetch that is no longer wanted can be
 * abandoned mid-flight.
 *
 * Nothing else is relaxed: the same session and workspace guard as every
 * action, the same zod validation at the boundary, the same ceilings on
 * calls per user and per workspace (counted in `askForJson`), and the
 * same honest word when there is no model.
 */
export async function aiRead<S extends z.ZodType, T>(
  request: Request,
  schema: S,
  fn: (
    ctx: OrgContext,
    input: z.infer<S>,
    locale: Locale,
  ) => Promise<{ proposal: T; engine: string } | null>,
  options: { requireModel?: boolean } = {},
): Promise<NextResponse<ProposalResult<T>>> {
  if (crossSite(request)) return answer({ ok: false, error: "unauthorized" }, 403);
  const ctx = await requireOrgContext();
  if (!ctx) return answer({ ok: false, error: "unauthorized" }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer({ ok: false, error: "invalid" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return answer({ ok: false, error: "invalid" }, 400);
  // Cheap and honest: without a model the caller learns it once and goes
  // quiet, instead of paying a model timeout per keystroke pause.
  if (options.requireModel && !(await modelConfigured(ctx)))
    return answer({ ok: false, error: "noModel" }, 200);
  try {
    const result = await fn(ctx, parsed.data as z.infer<S>, localeOf(request));
    if (!result) return answer({ ok: false, error: "notFound" }, 404);
    return answer({ ok: true, ...result }, 200);
  } catch (error) {
    const failure = classifyAiError(error);
    // The model not answering is not the server failing: a 5xx here would
    // be a red line in the log for an ordinary Tuesday with Ollama down.
    return answer({ ok: false, error: failure }, failure === "rateLimited" ? 429 : 200);
  }
}

function answer<T>(body: ProposalResult<T>, status: number): NextResponse<ProposalResult<T>> {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A server action checks that the page asking is the page we served;
 * moving a read onto a route must not quietly drop that. Same test as
 * Next's own: the origin the browser stamps against the host the request
 * was addressed to. No origin header at all is not a browser making a
 * cross-site request, and the session cookie — SameSite=Lax — is the
 * guard there.
 */
function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * A route has no locale segment to read, so the page says which language
 * it is asking in — and anything else falls back to the default rather
 * than being trusted.
 */
function localeOf(request: Request): Locale {
  const asked = new URL(request.url).searchParams.get("locale");
  return (routing.locales as readonly string[]).includes(asked ?? "")
    ? (asked as Locale)
    : routing.defaultLocale;
}
