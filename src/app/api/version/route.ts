import { NextResponse } from "next/server";
import { buildInfo } from "@/core/version";

export const dynamic = "force-dynamic";

/**
 * Which release is answering on this host. Public, so a deploy can be
 * verified and uptime monitoring can alert on a rollback, without a login.
 *
 * This is a deliberate exception to the rule that responses carry no
 * version information. Domino is AGPL: the source of any given release is
 * public anyway, so the commit tells an attacker nothing the repository
 * does not. What stays out is everything that is about *this* installation
 * rather than the release - runtime versions, environment, migration
 * state - which is why /api/health still answers with nothing but "ok" and
 * the full picture lives behind the login on the About page.
 */
export async function GET() {
  return NextResponse.json({
    name: "domino",
    version: buildInfo.version,
    commit: buildInfo.commit,
    release: buildInfo.release,
    builtAt: buildInfo.builtAt,
  });
}
