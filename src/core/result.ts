/**
 * Every mutation answers with one of these; the UI never sees a stack.
 * The error is a word the interface can render in the reader's language,
 * and the details stay in the server log. `detail` is the one exception:
 * a short code naming which product rule refused the input (a flow
 * document that does not hold together, docs/flow-format.md), so the
 * form can say which field rather than "invalid".
 */
export type ActionError =
  "unauthorized" | "forbidden" | "invalid" | "notFound" | "conflict" | "generic";

export type Result<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError; detail?: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = <T = undefined>(error: ActionError, detail?: string): Result<T> =>
  detail ? { ok: false, error, detail } : { ok: false, error };
