import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser-side auth client. Server code uses `auth.api` directly instead. */
export const authClient = createAuthClient({
  plugins: [organizationClient(), passkeyClient(), twoFactorClient()],
});
