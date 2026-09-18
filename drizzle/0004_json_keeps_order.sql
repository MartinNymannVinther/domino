-- The documents a flow is made of keep their keys in the order they were
-- written: a structured brick's schema lists the columns of a table in
-- the order the person put them, and jsonb sorts keys by length and
-- name. Nothing queries into these columns, so json — stored as the
-- text it arrived as — loses nothing and keeps the order (docs/adr/0011).
ALTER TABLE "flow_messages" ALTER COLUMN "proposal" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "flow_versions" ALTER COLUMN "document" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "flow_versions" ALTER COLUMN "patch" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "run_steps" ALTER COLUMN "input" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "run_steps" ALTER COLUMN "output" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "input" SET DATA TYPE json;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "input" SET DEFAULT '{}'::json;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "output" SET DATA TYPE json;