-- Security for the product tables: grants, forced row-level security keyed
-- on org_id, audit triggers, and the one privileged operation the
-- application role is allowed: deleting a whole workspace. See docs/adr/0011.

-- The application role owns the product tables in the only sense that
-- matters: it may read and write them, and RLS decides which rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "flows", "flow_versions", "flow_messages", "files", "runs", "run_steps"
TO domino_app;
--> statement-breakpoint
ALTER TABLE "flows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flows" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flow_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flow_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flow_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flow_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- One policy per table: rows of the active workspace, nothing else, for
-- reads and writes alike. Without a context every predicate is NULL.
CREATE POLICY app_tenant_flows ON "flows" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_flow_versions ON "flow_versions" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_flow_messages ON "flow_messages" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_files ON "files" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_runs ON "runs" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_run_steps ON "run_steps" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- Audit triggers on every table that holds what a workspace owns. runs
-- and run_steps are excluded: both are the record of what happened, and
-- auditing a record is a copy, not a record (docs/adr/0003, 0011). The files
-- table is audited, but audit_redact drops its bytes: the audit row says
-- a file came and went, never what was in it.
CREATE TRIGGER audit_flows
  AFTER INSERT OR UPDATE OR DELETE ON "flows"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_flow_versions
  AFTER INSERT OR UPDATE OR DELETE ON "flow_versions"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_flow_messages
  AFTER INSERT OR UPDATE OR DELETE ON "flow_messages"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_files
  AFTER INSERT OR UPDATE OR DELETE ON "files"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- The redaction list from 0001, with the files' bytes added: an audit
-- row must say a file came and went, never carry the file. The extracted
-- text stays — it is what the flow read, and what a person may need to
-- see to understand a run.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash', 'token_hash', 'api_key_cipher', 'bytes'
    ]
  END
$$;
--> statement-breakpoint

-- Deleting a workspace: the one thing the application role may do that RLS
-- and grants would otherwise forbid, wrapped in a function that checks the
-- caller itself. Dogma 3 says everything a workspace owns can be deleted
-- again completely, and that includes the audit rows about it: they carry
-- the flows' prompts and the files' text, and a team that leaves must not
-- leave a shadow. The append-only guard is stepped around for exactly this
-- transaction, and one context-free row records that the deletion happened.
--
-- The owner check raises with ERRCODE 42501 (insufficient_privilege), which
-- is what src/modules/export/workspace.ts matches; the wording is free to
-- change. The active-workspace check keeps plpgsql's default P0001 on
-- purpose: it is a backstop against a call the application cannot make.
CREATE OR REPLACE FUNCTION delete_workspace(p_org_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user text := nullif(current_setting('app.user_id', true), '');
  v_role text;
BEGIN
  IF p_org_id IS NULL OR p_org_id <> nullif(current_setting('app.org_id', true), '') THEN
    RAISE EXCEPTION 'delete_workspace: not the active workspace';
  END IF;
  SELECT role INTO v_role FROM memberships WHERE organization_id = p_org_id AND user_id = v_user;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'delete_workspace: only the workspace owner may delete it'
      USING ERRCODE = '42501';
  END IF;

  -- Domain rows, memberships and invitations follow the organization
  -- through cascading foreign keys; their audit rows are written by the
  -- triggers on the way out and purged just below.
  DELETE FROM organizations WHERE id = p_org_id;

  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM audit_log WHERE org_id = p_org_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  INSERT INTO audit_log (org_id, actor_user_id, actor_type, action, entity_type, entity_id)
  VALUES (NULL, v_user, 'user', 'workspace.deleted', 'organizations', p_org_id);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_workspace(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_workspace(text) TO domino_app;
