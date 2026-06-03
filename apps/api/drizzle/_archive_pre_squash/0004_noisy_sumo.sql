CREATE TABLE IF NOT EXISTS "notification_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"category" varchar(64) NOT NULL,
	"threshold_type" varchar(32) NOT NULL,
	"threshold_value" numeric(18, 2) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings_json" jsonb
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_thresholds" ADD CONSTRAINT "notification_thresholds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_thresholds" ADD CONSTRAINT "notification_thresholds_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
