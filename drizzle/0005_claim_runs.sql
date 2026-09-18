-- The runner's two doors through RLS (docs/adr/0013). The runner starts
-- with no workspace in mind: it takes the oldest queued run whoever owns
-- it, and only then works inside that workspace's context like every
-- other caller. A definer's-rights function is the one place the
-- application role may look across workspaces, and it hands back three
-- ids, never a row (the same shape as ai_calls_last_day, drizzle/0001).
--
-- FOR UPDATE SKIP LOCKED: two runners never claim the same run, and a
-- runner that is mid-claim never blocks another.
CREATE OR REPLACE FUNCTION claim_next_run() RETURNS TABLE(id text, org_id text, created_by text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE runs SET status = 'running', started_at = now()
  WHERE id = (
    SELECT r.id FROM runs r WHERE r.status = 'queued'
    ORDER BY r.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING runs.id, runs.org_id, runs.created_by;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_next_run() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_next_run() TO domino_app;
--> statement-breakpoint
-- One app, one runner: a run still marked running when the process
-- starts was interrupted by the process stopping, and is failed by name
-- rather than left spinning in the history.
CREATE OR REPLACE FUNCTION fail_interrupted_runs() RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH failed AS (
    UPDATE runs SET status = 'failed', error = 'interrupted: the server restarted', finished_at = now()
    WHERE status = 'running'
    RETURNING 1
  )
  SELECT count(*) FROM failed;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fail_interrupted_runs() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fail_interrupted_runs() TO domino_app;
