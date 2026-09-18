import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The server refuses to start on a bad environment, out loud.
 *
 * Next's standalone server loads route modules lazily, so a variable that
 * fails validation does not stop the server; it becomes a 500 on every
 * request while the container reports "Up". The instrumentation hook
 * imports the environment at boot and exits the process when it does not
 * validate. Next only logs a failed hook and keeps serving, which is why
 * the exit is ours to call, and why this test asserts the exit and not
 * merely the throw.
 */

const REQUIRED = {
  APP_DATABASE_URL: "postgres://app:app@localhost:5432/domino",
  AUTH_DATABASE_URL: "postgres://auth:auth@localhost:5432/domino",
  BETTER_AUTH_SECRET: "LongEnoughSecretForTheProductionGuard0123456789",
  NEXT_RUNTIME: "nodejs",
};

async function boot(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { register } = await import("@/instrumentation");
  await register();
  return { exit, error };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the instrumentation hook", () => {
  it("stops the process when the environment does not validate", async () => {
    const { exit, error } = await boot({
      ...REQUIRED,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://domino.haij.dk",
    });
    expect(exit).toHaveBeenCalledWith(1);
    const said = error.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(said).toContain("refusing to start");
    expect(said).toContain("BETTER_AUTH_URL");
  });

  it("lets a valid environment through without a word", async () => {
    const { exit, error } = await boot({
      ...REQUIRED,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://domino.haij.dk",
    });
    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("does nothing outside the Node runtime, where pg cannot load", async () => {
    const { exit } = await boot({
      ...REQUIRED,
      NEXT_RUNTIME: "edge",
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://not-checked-here",
    });
    expect(exit).not.toHaveBeenCalled();
  });
});
