import { NextResponse, type NextRequest } from "next/server";
import { callerKey, rateLimit } from "@/core/rate-limit";
import {
  createDemoWorkspace,
  demoCookieSecure,
  demoEnabled,
  demoLandingUrl,
} from "@/modules/demo/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A refusal the browser can read. Without a content type a body is not
 * rendered but saved, and the visitor gets an empty file named after the
 * path instead of the sentence explaining why the demo did not open.
 */
function refusal(message: string, status: number, headers: HeadersInit = {}) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

/**
 * The front door for someone who wants to try Domino without asking for an
 * account. It builds a workspace, signs the visitor in and sends them to
 * their flows.
 *
 * A GET that creates something is unusual, and deliberate: the point is a
 * link somebody can put on a website. What it creates is throwaway, so
 * the usual reason not to — a crawler triggering it — costs a row that
 * expires within the day, and the rate limit keeps that bounded.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  if (!demoEnabled()) return refusal("Not found", 404);

  const limit = rateLimit(callerKey(request.headers, "demo"), 5, 60 * 60 * 1000);
  if (!limit.allowed)
    return refusal("Too many demo workspaces from this address. Try again later.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });

  const { locale } = await params;
  const language = locale === "en" ? "en" : "da";
  const demo = await createDemoWorkspace(language);
  if (!demo) return refusal("The demo is not available right now.", 503);

  // Both the destination and the cookie's Secure flag come from the
  // installation's public origin, not from the request: behind the proxy
  // the request only knows the container's own address.
  const response = NextResponse.redirect(demoLandingUrl(language), {
    status: 303,
  });
  // The sign-up call answered with the session cookie; hand it on.
  for (const cookie of demo.headers.get("cookie")?.split("; ") ?? []) {
    const [name, ...rest] = cookie.split("=");
    if (name && rest.length)
      response.cookies.set(name, rest.join("="), {
        httpOnly: true,
        sameSite: "lax",
        secure: demoCookieSecure(),
        path: "/",
      });
  }
  return response;
}
