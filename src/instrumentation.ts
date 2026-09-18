/**
 * Runs once when the server starts, before it accepts a request.
 *
 * The one job here is to make a bad environment fail loudly. Next's
 * standalone server loads route modules lazily, so without this, a
 * variable that fails validation does not stop the server from starting;
 * it turns into a 500 on the first request that happens to import
 * `@/core/env`, and every request after it. The container reports "Up",
 * the health check reports 500, and the cause is nowhere near either of
 * those words. That is exactly how the first deployment went.
 *
 * Node runtime only: the edge runtime cannot import pg, and there is no
 * edge runtime in this app anyway. The work sits in instrumentation-node
 * behind a dynamic import, the shape Next documents, so the edge
 * compilation contains neither pg nor `process.exit`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvironmentOrExit } = await import("./instrumentation-node");
  await validateEnvironmentOrExit();
}
