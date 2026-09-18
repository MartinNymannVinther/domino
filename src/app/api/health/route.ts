import { NextResponse } from "next/server";
import { appPool } from "@/core/db/client";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for Docker, Coolify and uptime monitoring.
 * Verifies database connectivity. Deliberately returns no version or
 * environment information.
 *
 * The response says nothing about the cause, because this endpoint is
 * public. The log does, because somebody has to fix it. Without that, an
 * unhealthy container says only "unhealthy", and the operator's next move
 * is to open psql and guess — which is exactly how the first deployment
 * went. Code and message only, not the error object: a connection failure
 * is the likely one, and there is no reason to put a connection string
 * anywhere near a log line.
 */
export async function GET() {
  try {
    await appPool.query("select 1");
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: string; message?: string };
    console.error(`health: database check failed${code ? ` (${code})` : ""}: ${message ?? error}`);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
