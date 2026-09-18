import { NextResponse } from "next/server";
import { callerKey, rateLimit } from "@/core/rate-limit";
import { cleanupExpiredDemos, demoEnabled } from "@/modules/demo/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cleanup for an installation that would rather run it on a schedule than
 * rely on visits. It is safe to call from anywhere because it can only
 * delete demos that have already expired: there is nothing to protect and
 * nothing to leak, so it needs no secret — but it is public, so it keeps
 * the same throttle every public endpoint has.
 */
export async function POST(request: Request) {
  if (!demoEnabled()) return new NextResponse("Not found", { status: 404 });
  const limit = rateLimit(callerKey(request.headers, "demo-cleanup"), 6, 60_000);
  if (!limit.allowed)
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  const removed = await cleanupExpiredDemos();
  return NextResponse.json({ removed });
}
