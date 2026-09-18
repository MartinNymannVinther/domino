-- The foundation's security model in one migration: runtime roles,
-- least-privilege grants, row-level security on every table, the append-only
-- audit log with its triggers, and the admission tables' confinement. This is
-- the Haij foundation (docs/adr/0001) applied to Domino (via Ajour); the reasoning lives in
-- docs/adr/0002 (tenancy), 0003 (audit) and 0004 (admission).
--
-- Roles are created NOLOGIN if missing so this migration is self-contained;
-- provisioning (scripts/ensure-roles.ts, docker/postgres-init/01-roles.sh)
-- sets LOGIN and passwords. Migrations must run as a superuser (docs/deploy.md).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_app') THEN
    CREATE ROLE domino_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_auth') THEN
    CREATE ROLE domino_auth NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO domino_app, domino_auth;
--> statement-breakpoint

-- Better Auth owns the auth tables and is the only writer of them. The
-- admission tables have no org_id: they describe people who are not users
-- yet and keys that let one address register, so they belong to the
-- installation like the auth tables and are reachable the same way - the
-- auth role gets them in full, the application role not at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "sessions", "accounts", "verifications",
  "organizations", "memberships", "invitations",
  "passkeys", "two_factors", "rate_limits",
  "access_requests", "access_invitations"
TO domino_auth;
--> statement-breakpoint
GRANT INSERT ON "audit_log" TO domino_auth;
--> statement-breakpoint

-- The application role gets narrow read access plus audit inserts. It has
-- deliberately no access at all to accounts, sessions, verifications,
-- passkeys, two_factors, rate_limits or the admission tables: domain code
-- can never touch password hashes, session tokens, TOTP secrets or
-- invitation keys.
GRANT SELECT ON "users", "organizations", "memberships" TO domino_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO domino_app;
--> statement-breakpoint

-- Tenant context helpers. current_setting(..., true) returns NULL when the
-- setting is absent, so a missing context matches no rows: default deny.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint

-- RLS on, and forced so not even the table owner is exempt (superusers
-- always bypass RLS; no runtime role is a superuser).
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "two_factors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "two_factors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Better Auth needs unrestricted access to its own tables (login happens
-- before any org context exists). The role is confined by grants instead:
-- it cannot see any domain table.
CREATE POLICY auth_all_users ON "users" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_sessions ON "sessions" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_accounts ON "accounts" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_verifications ON "verifications" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_organizations ON "organizations" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_memberships ON "memberships" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_invitations ON "invitations" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_passkeys ON "passkeys" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_two_factors ON "two_factors" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_rate_limits ON "rate_limits" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_access_requests ON "access_requests" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_all_access_invitations ON "access_invitations" FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY auth_insert_audit ON "audit_log" FOR INSERT TO domino_auth WITH CHECK (true);
--> statement-breakpoint

-- Application role policies: a user sees themselves, the organizations they
-- are a member of, and rows belonging to the active organization. Without a
-- context every predicate is NULL and nothing matches.
CREATE POLICY app_select_self ON "users" FOR SELECT TO domino_app
  USING (id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_select_memberships ON "memberships" FOR SELECT TO domino_app
  USING (
    user_id = app_current_user_id()
    OR organization_id = app_current_org_id()
  );
--> statement-breakpoint
CREATE POLICY app_select_organizations ON "organizations" FOR SELECT TO domino_app
  USING (
    id = app_current_org_id()
    OR id IN (
      SELECT organization_id FROM "memberships"
      WHERE user_id = app_current_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY app_select_audit ON "audit_log" FOR SELECT TO domino_app
  USING (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_insert_audit ON "audit_log" FOR INSERT TO domino_app
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- Audit logging: database triggers capture before/after for every row
-- mutation, and audit_log is made append-only at the database level.

-- Strips secrets from row images before they enter the audit trail. The key
-- list is deliberately a blanket list applied to every table.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash', 'token_hash', 'api_key_cipher'
    ]
  END
$$;
--> statement-breakpoint

-- Row-change capture. SECURITY DEFINER (owned by the migration superuser)
-- so the insert into audit_log is possible no matter which confined role
-- triggered the change. Actor and org come from the transaction-local
-- context; context-less writes (auth, migrations, system jobs) fall back to
-- the row's own tenant column - `org_id` on domain tables,
-- `organization_id` on the auth tables - and actor_type 'system'.
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org text := nullif(current_setting('app.org_id', true), '');
  v_actor text := nullif(current_setting('app.user_id', true), '');
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
  END IF;

  IF v_org IS NULL THEN
    v_org := coalesce(
      v_after ->> 'org_id',
      v_before ->> 'org_id',
      v_after ->> 'organization_id',
      v_before ->> 'organization_id'
    );
    IF v_org IS NULL AND TG_TABLE_NAME = 'organizations' THEN
      v_org := coalesce(v_after ->> 'id', v_before ->> 'id');
    END IF;
  END IF;

  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  INSERT INTO audit_log (
    org_id, actor_user_id, actor_type, action,
    entity_type, entity_id, before_data, after_data
  )
  VALUES (
    v_org,
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    audit_redact(v_before),
    audit_redact(v_after)
  );

  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint

-- Append-only enforcement: rejects UPDATE/DELETE/TRUNCATE for every role,
-- superusers included. Grants already withhold UPDATE/DELETE from the
-- runtime roles; this trigger is the backstop.
CREATE OR REPLACE FUNCTION audit_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_block_mutation();
--> statement-breakpoint

-- Row-change triggers on every business-meaningful table. sessions,
-- verifications and rate_limits are technical, high-churn tables and are
-- excluded; logins/logouts are recorded as semantic events instead
-- (src/core/audit/events.ts). The admission tables are covered by semantic
-- events too, because their rows hold personal data about people who are
-- not users. The trade-off is recorded in ADR 0003.
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_memberships
  AFTER INSERT OR UPDATE OR DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_invitations
  AFTER INSERT OR UPDATE OR DELETE ON "invitations"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_passkeys
  AFTER INSERT OR UPDATE OR DELETE ON "passkeys"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_two_factors
  AFTER INSERT OR UPDATE OR DELETE ON "two_factors"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- Let the application read Drizzle's own migration journal. The About page
-- compares the number of migrations the build was made from with the number
-- the database has applied, so a deploy where the container started but the
-- migration step did not shows up as a warning. Read-only, on Drizzle's
-- bookkeeping table only: no org_id, no domain data, nothing RLS protects.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA drizzle TO domino_app';
    EXECUTE 'GRANT SELECT ON drizzle."__drizzle_migrations" TO domino_app';
  END IF;
END $$;

--> statement-breakpoint
-- Members of the active workspace are visible to the application role, so
-- the workspace can list who is in it and put a name on a card. Credentials
-- stay out of reach: the role has no grant on accounts, sessions, passkeys
-- or two_factors.
CREATE POLICY app_select_org_members ON "users" FOR SELECT TO domino_app
  USING (id IN (SELECT user_id FROM "memberships" WHERE organization_id = app_current_org_id()));
--> statement-breakpoint

-- The per-call counter behind the AI ceilings (src/modules/ai/limits.ts):
-- a domain table like any other, minus the audit trigger, because a
-- counter is not something a workspace owns (docs/adr/0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_calls" TO domino_app;
--> statement-breakpoint
ALTER TABLE "ai_calls" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_calls" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_tenant_ai_calls ON "ai_calls" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- The per-workspace model setting: the grant, forced RLS on org_id and an
-- audit trigger. The encrypted key is on the redaction list above, so the
-- audit trail records that a workspace changed its model and who did it,
-- never a second copy of the ciphertext (docs/adr/0006).
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_llm_settings" TO domino_app;
--> statement-breakpoint
ALTER TABLE "workspace_llm_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_llm_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_tenant_workspace_llm_settings ON "workspace_llm_settings" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE TRIGGER audit_workspace_llm_settings
  AFTER INSERT OR UPDATE OR DELETE ON "workspace_llm_settings"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- The demo table is installation state, not workspace data. The
-- application role never touches it: the demo route runs as the auth role
-- (which already creates users and organizations) and the cleanup runs as
-- the migration role. It gets forced RLS with no policy for the
-- application role at all, so even a stray grant would show it nothing;
-- the one role meant to reach it needs a policy saying so (docs/adr/0005).
REVOKE ALL ON TABLE demo_workspaces FROM domino_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE demo_workspaces TO domino_auth;
--> statement-breakpoint
ALTER TABLE demo_workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE demo_workspaces FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY demo_auth_all ON demo_workspaces FOR ALL TO domino_auth USING (true) WITH CHECK (true);
--> statement-breakpoint

-- The installation's own ceiling on model calls (docs/adr/0035, taken
-- from Tavle where it arrived as its own migration).
--
-- The two ceilings in src/modules/ai/limits.ts are both counted inside a
-- tenant context, so neither can see past the workspace it is counting.
-- A person in three workspaces therefore has three times the per-user
-- ceiling, and an installation running DEMO=on — where every visitor gets
-- a workspace, and every workspace its own 600 a day — has no total at
-- all. The number this function returns is that total.
--
-- SECURITY DEFINER, owned by the migration role, so the count crosses the
-- tenant boundary while the rows never do: the application role still sees
-- only its own workspace's ai_calls rows under the forced RLS policy above,
-- and gains exactly one number it could not otherwise compute. No
-- parameters, so there is nothing to aim it with; it can answer one
-- question and only that one.
--
-- STABLE, not IMMUTABLE: it reads a table and now(). A SQL-language body
-- would be inlined by the planner if it were not SECURITY DEFINER, which
-- would run it as the caller and quietly return zero; prosecdef blocks
-- inlining, and the test in tests/ai/limits.test.ts proves the number
-- crosses workspaces rather than trusting that.
CREATE OR REPLACE FUNCTION ai_calls_last_day() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM ai_calls WHERE created_at > now() - interval '1 day';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_calls_last_day() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ai_calls_last_day() TO domino_app;
--> statement-breakpoint
-- ai_calls' other index leads with user_id, which is no use to a count
-- over every workspace's last day.
CREATE INDEX "ai_calls_created_idx" ON "ai_calls" USING btree ("created_at");
