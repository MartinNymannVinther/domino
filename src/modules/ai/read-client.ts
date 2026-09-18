import type { ProposalResult } from "./wire";

/**
 * The client half of the read-only AI doors (docs/adr/0034). A plain
 * fetch, deliberately: a server action from the same client waits in one
 * queue, and the person's next card must never wait for the model. The
 * signal is the other half of the promise — a stale keystroke or a
 * cancelled dialog abandons its call instead of landing late.
 *
 * It never throws: an abandoned call, a broken connection and a confused
 * answer all read as an ordinary failure, and the assist that asked goes
 * quiet. Degrade to nothing, not to broken (docs/adr/0025).
 */
export async function askAi<T>(
  road: "quick-assist" | "close-advice",
  body: unknown,
  { locale, signal }: { locale: string; signal?: AbortSignal },
): Promise<ProposalResult<T>> {
  try {
    const response = await fetch(`/api/ai/${road}?locale=${encodeURIComponent(locale)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    const data = (await response.json()) as ProposalResult<T>;
    if (typeof data !== "object" || data === null || typeof data.ok !== "boolean")
      return { ok: false, error: "badAnswer" };
    return data;
  } catch {
    return { ok: false, error: "generic" };
  }
}
