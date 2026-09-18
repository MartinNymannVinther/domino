/**
 * What an invitation is right now. Pure, so the owner's page can show it
 * without pulling the database into the browser bundle.
 */
export type InvitationLifecycle = { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date };

export type InvitationState = "used" | "revoked" | "expired" | "open";

export function invitationState(row: InvitationLifecycle, now = new Date()): InvitationState {
  if (row.usedAt) return "used";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  return "open";
}
