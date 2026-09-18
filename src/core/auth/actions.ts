"use server";

import { headers } from "next/headers";
import { registerUserWithOrganization, type RegisterResult } from "./register";

export type { RegisterResult };

/** Server-action wrapper around the framework-free registration flow. */
export async function registerAction(input: unknown): Promise<RegisterResult> {
  return registerUserWithOrganization(await headers(), input);
}
