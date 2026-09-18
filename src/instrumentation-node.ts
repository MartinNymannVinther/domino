/**
 * The Node half of the instrumentation hook: make a bad environment fail
 * loudly at boot. Kept in its own module, imported only inside the
 * runtime check in instrumentation.ts, so the edge compilation never
 * sees `process.exit` — Turbopack compiles instrumentation.ts for both
 * runtimes and warns about every Node API it can see there, on every
 * request in development.
 *
 * Next itself only logs a failed hook and carries on serving 500s, which
 * is the same silence with a better log line, so the exit is ours: print
 * the zod message and stop the process. Docker then restarts it, the
 * container shows as restarting rather than up, and the message is the
 * last thing in the log.
 */
export async function validateEnvironmentOrExit(): Promise<void> {
  try {
    await import("@/core/env");
  } catch (error) {
    console.error("domino: refusing to start, the environment is not valid.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
