import { afterEach, describe, expect, it } from "vitest";
import { askAi } from "@/modules/ai/read-client";

/**
 * The client half of the read-only AI door (docs/adr/0034). Two promises
 * are kept here. The call carries the page's own language and can be
 * abandoned mid-flight — a stale keystroke or a cancelled dialog must not
 * land later. And it never throws: a dropped call, a dead connection and
 * a confused answer all read as an ordinary failure, so the assist goes
 * quiet instead of taking the page down with it.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Seen = { url: string; init: RequestInit | undefined };

function answering(body: string, status = 200): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return seen;
}

describe("asking the AI for a read", () => {
  it("asks in the page's language and hands the proposal back", async () => {
    const seen = answering(JSON.stringify({ ok: true, proposal: { place: null }, engine: "e" }));
    const result = await askAi(
      "quick-assist",
      { boardId: "b", title: "et nyt kort" },
      {
        locale: "en",
      },
    );
    expect(result).toEqual({ ok: true, proposal: { place: null }, engine: "e" });
    expect(seen[0]!.url).toBe("/api/ai/quick-assist?locale=en");
    expect(seen[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ boardId: "b", title: "et nyt kort" });
  });

  it("carries the signal, and an abandoned call is simply a failure", async () => {
    answering("{}");
    const controller = new AbortController();
    controller.abort();
    const result = await askAi(
      "close-advice",
      { itemId: "i" },
      {
        locale: "da",
        signal: controller.signal,
      },
    );
    expect(result.ok).toBe(false);
  });

  it("degrades to nothing, not to broken", async () => {
    answering("<html>en fejlside</html>");
    expect(await askAi("close-advice", { itemId: "i" }, { locale: "da" })).toEqual({
      ok: false,
      error: "generic",
    });

    answering(JSON.stringify({ proposal: "uden ok" }));
    expect(await askAi("close-advice", { itemId: "i" }, { locale: "da" })).toEqual({
      ok: false,
      error: "badAnswer",
    });

    globalThis.fetch = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    expect(await askAi("close-advice", { itemId: "i" }, { locale: "da" })).toEqual({
      ok: false,
      error: "generic",
    });
  });
});
