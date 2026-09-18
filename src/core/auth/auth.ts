import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { platformRoleForNewUser } from "@/core/access/service";
import { recordAuthEvent } from "@/core/audit/events";
import { authDb } from "@/core/db/client";
import * as schema from "@/core/db/schema";
import { env } from "@/core/env";
import {
  countUsers,
  DEMO_HEADER,
  INVITATION_HEADER,
  isDemoSignup,
  signupAllowed,
  TEAM_INVITATION_HEADER,
} from "./signup";

const baseUrl = new URL(env.BETTER_AUTH_URL);

/** First membership of the user, used as the initial active organization. */
async function getDefaultOrganizationId(userId: string): Promise<string | null> {
  const rows = await authDb
    .select({ organizationId: schema.memberships.organizationId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

export const auth = betterAuth({
  appName: "Domino",
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: {
      ...schema,
      // The adapter looks tables up by model name; alias the snake_case
      // model names to the camelCase schema exports.
      two_factors: schema.twoFactors,
      rate_limits: schema.rateLimits,
    },
  }),
  user: {
    modelName: "users",
    additionalFields: {
      // Role on the installation (see src/core/access). `input: false`
      // keeps it out of every request body: nobody registers as owner.
      platformRole: { type: "string", required: false, input: false },
    },
  },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  emailAndPassword: {
    enabled: true,
    // OWASP ASVS: minimum 12 characters. No email provider before phase 2,
    // so verification is intentionally off (recorded in ADR 0001).
    minPasswordLength: 12,
    requireEmailVerification: false,
  },
  rateLimit: {
    // On in every environment, stored in Postgres (no extra infrastructure).
    enabled: true,
    storage: "database",
    modelName: "rate_limits",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/two-factor/verify-totp": { window: 60, max: 10 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // The first account on an empty installation owns it. Decided
        // here, at the moment of creation, so it holds for every path
        // that can create a user and not only for the registration form.
        before: async (user) => ({
          data: { ...user, platformRole: platformRoleForNewUser(await countUsers()) },
        }),
      },
    },
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await getDefaultOrganizationId(session.userId),
          },
        }),
        after: async (session) => {
          const { activeOrganizationId } = session as { activeOrganizationId?: string | null };
          await recordAuthEvent({
            action: "auth.login",
            actorUserId: session.userId,
            orgId: activeOrganizationId ?? null,
            entityType: "sessions",
            entityId: session.id,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        },
      },
    },
  },
  hooks: {
    // The endpoint is the door, not the page. Hiding the registration form
    // closes the front door only; this closes the one that matters.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const body = (ctx.body ?? {}) as { email?: unknown };
        const attempt = {
          email: typeof body.email === "string" ? body.email : null,
          invitationToken: ctx.headers?.get(INVITATION_HEADER) ?? null,
          teamInvitationId: ctx.headers?.get(TEAM_INVITATION_HEADER) ?? null,
          demo: isDemoSignup(ctx.headers?.get(DEMO_HEADER)),
        };
        if (!(await signupAllowed(attempt))) {
          throw new APIError("FORBIDDEN", { code: "SIGNUP_CLOSED", message: "Sign-up is closed" });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-out") {
        const session = ctx.context.session;
        await recordAuthEvent({
          action: "auth.logout",
          actorUserId: session?.user.id ?? null,
          orgId: session?.session.activeOrganizationId ?? null,
          entityType: "sessions",
          entityId: session?.session.id ?? null,
        });
      }
    }),
  },
  plugins: [
    organization({
      schema: {
        organization: { modelName: "organizations" },
        member: { modelName: "memberships" },
        invitation: { modelName: "invitations" },
      },
    }),
    passkey({
      rpID: baseUrl.hostname,
      rpName: "Domino",
      origin: env.BETTER_AUTH_URL,
      schema: {
        passkey: { modelName: "passkeys" },
      },
    }),
    twoFactor({
      issuer: "Domino",
      schema: {
        twoFactor: { modelName: "two_factors" },
      },
    }),
    // Must stay last: makes Better Auth set cookies from server actions.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
