import { appPool } from "@/core/db/client";
import { buildInfo } from "@/core/version";

/**
 * Whether the database has caught up with the code.
 *
 * The build knows how many migrations were checked in when it was made;
 * Drizzle records how many have been applied. A deploy where the container
 * started but the migration step did not is the failure this catches, and
 * it is a failure that otherwise shows up as an unrelated query error
 * somewhere far away.
 *
 * The application role may well have no rights in the `drizzle` schema -
 * it is not a domain table and RLS does not cover it - so an unreadable
 * journal is an expected answer, not an error.
 */
export type SchemaState = {
  expected: number;
  applied: number | null;
  appliedAt: string | null;
  behind: boolean;
};

export async function getSchemaState(): Promise<SchemaState> {
  const expected = buildInfo.migrationCount;

  try {
    const result = await appPool.query<{ applied: string; latest: string | null }>(
      "select count(*)::text as applied, max(created_at)::text as latest from drizzle.__drizzle_migrations",
    );
    const row = result.rows[0];
    const applied = row ? Number(row.applied) : null;
    const latest = row?.latest ? Number(row.latest) : null;

    return {
      expected,
      applied,
      // Drizzle stores milliseconds since the epoch.
      appliedAt: latest ? new Date(latest).toISOString() : null,
      behind: applied !== null && expected > 0 && applied < expected,
    };
  } catch {
    return { expected, applied: null, appliedAt: null, behind: false };
  }
}
