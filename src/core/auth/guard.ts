import type { OrgContext } from "@/core/db/tenant";
import { getOrgContext } from "./session";

/**
 * Server-action guard: resolves the caller's tenant context or returns
 * null. Actions must treat null as "unauthorized" and return a generic
 * error — never throw details to the client.
 */
export async function requireOrgContext(): Promise<OrgContext | null> {
  return getOrgContext();
}
