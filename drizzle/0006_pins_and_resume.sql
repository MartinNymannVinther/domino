CREATE TABLE "flow_pins" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"org_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"node_id" text NOT NULL,
	"port" text NOT NULL,
	"value" json NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "reused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "failed_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "resumed_from" text;--> statement-breakpoint
ALTER TABLE "flow_pins" ADD CONSTRAINT "flow_pins_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_pins" ADD CONSTRAINT "flow_pins_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_pins" ADD CONSTRAINT "flow_pins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_pins_node_port_uq" ON "flow_pins" USING btree ("flow_id","node_id","port");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_resumed_from_runs_id_fk" FOREIGN KEY ("resumed_from") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The new table is a product table like any other: the application role
-- may read and write it, RLS decides which rows, and the audit trigger
-- records the change. A pinned value is often a page of somebody's
-- document; `value` is already on audit_redact's list (drizzle/0003), so
-- the audit row says a pin was set and on which brick, never what was in
-- it (docs/adr/0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON "flow_pins" TO domino_app;
--> statement-breakpoint
ALTER TABLE "flow_pins" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flow_pins" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_tenant_flow_pins ON "flow_pins" FOR ALL TO domino_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE TRIGGER audit_flow_pins
  AFTER INSERT OR UPDATE OR DELETE ON "flow_pins"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
