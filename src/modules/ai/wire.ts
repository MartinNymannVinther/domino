/**
 * What a proposal answers with, in one place because both doors use it:
 * the server actions that propose-and-apply, and the read-only routes the
 * quiet assists fetch (docs/adr/0034).
 *
 * This file imports nothing, and that is its whole job. A client
 * component naming a value from a service module drags the service's
 * imports with it — `@/core/db/client` opens a pool, `@/core/env`
 * validates secrets at module evaluation — and the page stops building.
 * So the few numbers a form and a service must agree on live here, where
 * there is nothing behind them to pull in.
 */

/** The word the interface shows for why the model did not answer. */
export type AiFailure = "noModel" | "rateLimited" | "unreachable" | "badAnswer" | "generic";

export type ProposalResult<T> =
  | { ok: true; proposal: T; engine: string }
  | { ok: false; error: AiFailure | "unauthorized" | "invalid" | "notFound" };

/**
 * A task, not an essay: long enough for a paragraph of intent, short
 * enough to stay one. The field stops typing here and the boundary
 * refuses more (docs/adr/0037).
 */
export const MAX_INSTRUCTION_CHARS = 1000;
