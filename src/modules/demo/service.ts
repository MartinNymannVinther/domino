import { randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { auth } from "@/core/auth/auth";
import { authDb } from "@/core/db/client";
import { demoWorkspaces } from "@/core/db/schema";
import { DEMO_HEADER, demoSignupHeaderValue } from "@/core/auth/signup";
import { env } from "@/core/env";
import { organizationSlug } from "@/lib/slug";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import { createFlow } from "@/modules/flow/service";

/**
 * A demo is a real workspace with a throwaway account in it and a date on
 * which it stops existing. Everything a visitor touches is the product:
 * the same tables, the same policies, the same services, so nothing shown
 * here can quietly differ from what a customer would get. A demo opens
 * with the three example flows, made through the same service as a
 * person's own, so there is something to run within a minute.
 *
 * Nothing here runs unless DEMO=on. On an installation that has not asked
 * for it, the route below answers 404 and this file is dead code.
 */

export const DEMO_TTL_HOURS = 24;
/** A ceiling on how many demo workspaces may exist at once. */
export const MAX_LIVE_DEMOS = 200;

export function demoEnabled(): boolean {
  return env.DEMO === "on";
}

/**
 * Where a new demo lands, as a URL the browser can follow.
 *
 * Built from BETTER_AUTH_URL and never from the request, because behind
 * the proxy the request does not know the public address: Next hands a
 * route handler `https://0.0.0.0:3000/...`, the container's own listen
 * address, and a redirect built on that sends the visitor to a place
 * that does not exist. BETTER_AUTH_URL is the installation's declared
 * public origin, the same one passkeys and share links are bound to.
 */
export function demoLandingUrl(locale: "da" | "en"): URL {
  const prefix = locale === "da" ? "" : `/${locale}`;
  return new URL(`${prefix}/flows`, env.BETTER_AUTH_URL);
}

/**
 * Whether the demo's session cookie carries the Secure flag. Decided by
 * the public origin, for the same reason as above: the request's own
 * protocol is `http:` inside the container even when every visitor
 * arrives over TLS, and a session cookie without Secure on a public
 * installation is a cookie that may be sent in the clear.
 */
export function demoCookieSecure(): boolean {
  return env.BETTER_AUTH_URL.startsWith("https://");
}

export type DemoSession = { headers: Headers } | null;

/** Turns the set-cookie headers of an API response into a cookie header. */
function cookieHeaderFrom(responseHeaders: Headers): Headers {
  const cookie = responseHeaders
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return new Headers({ cookie });
}

/**
 * Deletes every demo whose time is up. Called on each visit, so an
 * installation that gets visitors needs no scheduler; `scripts/cleanup-demos.ts`
 * and the endpoint exist for one that does not.
 *
 * The organization's cascades take the workspace's rows with it. The
 * throwaway user is removed too, because a demo that leaves accounts
 * behind is a demo that leaks addresses nobody gave.
 */
export async function cleanupExpiredDemos(now = new Date()): Promise<number> {
  const expired = await authDb
    .delete(demoWorkspaces)
    .where(lt(demoWorkspaces.expiresAt, now))
    .returning({ organizationId: demoWorkspaces.organizationId, userId: demoWorkspaces.userId });
  for (const row of expired) {
    try {
      await authDb.execute(sql`delete from organizations where id = ${row.organizationId}`);
      await authDb.execute(sql`delete from users where id = ${row.userId}`);
    } catch (error) {
      // One stuck demo must not stop the others being cleaned up.
      console.error("demo: cleanup failed for", row.organizationId, error);
    }
  }
  return expired.length;
}

async function liveDemoCount(): Promise<number> {
  const [row] = await authDb.select({ n: sql<number>`count(*)::int` }).from(demoWorkspaces);
  return Number(row?.n ?? 0);
}

/**
 * Builds a demo and returns the cookie that signs the visitor into it.
 * The account is created through the ordinary sign-up path rather than by
 * writing rows, so a demo session is a session like any other and every
 * guard behaves the way it will for a real user.
 */
export async function createDemoWorkspace(locale: "da" | "en"): Promise<DemoSession> {
  if (!demoEnabled()) return null;
  await cleanupExpiredDemos();
  if ((await liveDemoCount()) >= MAX_LIVE_DEMOS) return null;

  const key = randomBytes(9).toString("hex");
  const email = `demo-${key}@demo.invalid`;
  const password = randomBytes(24).toString("base64url");
  const name = locale === "da" ? "Gæst" : "Guest";
  const workspaceName = locale === "da" ? "Demo-arbejdsrum" : "Demo workspace";

  let sessionHeaders: Headers;
  let userId: string;
  try {
    const { headers: responseHeaders, response } = await auth.api.signUpEmail({
      body: { name, email, password },
      // The demo bypasses the admission gate on purpose: this account is
      // not a person asking to be let in, it is a session that expires.
      headers: new Headers({ [DEMO_HEADER]: demoSignupHeaderValue() }),
      returnHeaders: true,
    });
    sessionHeaders = cookieHeaderFrom(responseHeaders);
    userId = response.user!.id;
  } catch (error) {
    console.error("demo: could not create the visitor's account", error);
    return null;
  }

  const organization = await auth.api.createOrganization({
    body: { name: workspaceName, slug: organizationSlug(`${workspaceName}-${key}`) },
    headers: sessionHeaders,
  });
  if (!organization) return null;
  await auth.api.setActiveOrganization({
    body: { organizationId: organization.id },
    headers: sessionHeaders,
  });

  await authDb.insert(demoWorkspaces).values({
    organizationId: organization.id,
    userId,
    expiresAt: new Date(Date.now() + DEMO_TTL_HOURS * 60 * 60 * 1000),
  });

  // The examples, oldest first so the list reads in the order they are
  // meant to be met; a failure here leaves a working, emptier demo.
  const ctx = { orgId: organization.id, userId };
  for (const example of [...EXAMPLE_FLOWS].reverse()) {
    try {
      await createFlow(ctx, example.document, { message: "eksempel" });
    } catch (error) {
      console.error("demo: could not seed an example flow", example.key, error);
    }
  }

  return { headers: sessionHeaders };
}

/** True when the workspace the caller is in is a demo. */
export async function isDemoWorkspace(orgId: string): Promise<boolean> {
  const [row] = await authDb
    .select({ id: demoWorkspaces.id })
    .from(demoWorkspaces)
    .where(sql`${demoWorkspaces.organizationId} = ${orgId}`)
    .limit(1);
  return Boolean(row);
}
