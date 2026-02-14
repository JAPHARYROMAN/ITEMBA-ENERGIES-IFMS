ALTER TABLE "shifts" ALTER COLUMN "status" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "total_expected_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "total_collected_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "variance_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "variance_reason" varchar(512);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "submitted_for_approval_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shifts_branch_id_status_idx" ON "shifts" USING btree ("branch_id","status");