import { authDb } from "@/core/db/client";
import { auditLog } from "@/core/db/schema";

export type SemanticAuditEvent = {
  action:
    | "auth.login"
    | "auth.logout"
    | "access.requested"
    | "access.approved"
    | "access.declined"
    | "invitation.created"
    | "invitation.used";
  orgId?: string | null;
  actorUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Records a semantic auth event (login/logout, admission) in the audit log.
 *
 * Row-level mutations are captured automatically by database triggers (see
 * the audit migration); this function only covers meaningful events that do
 * not map 1:1 to a row change, and the admission tables, which have no
 * org_id for a trigger to key on. It runs on the auth pool because these
 * events originate before/outside any org context.
 *
 * Best-effort by design: an audit failure here must not break login/logout,
 * so errors are logged and swallowed.
 */
export async function recordAuthEvent(event: SemanticAuditEvent): Promise<void> {
  try {
    await authDb.insert(auditLog).values({
      orgId: event.orgId ?? null,
      actorUserId: event.actorUserId ?? null,
      actorType: event.actorUserId ? "user" : "system",
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    });
  } catch (error) {
    console.error("audit: failed to record auth event", error);
  }
}
