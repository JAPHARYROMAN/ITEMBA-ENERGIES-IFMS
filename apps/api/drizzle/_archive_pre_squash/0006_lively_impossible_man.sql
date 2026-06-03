CREATE TABLE IF NOT EXISTS "export_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_user_id" uuid,
	"ip" varchar(64),
	"user_agent" varchar(1024),
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" uuid NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"stage" varchar(32) DEFAULT 'generate' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(255),
	"last_error" text,
	"artifact_path" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_type" varchar(128) NOT NULL,
	"retention_days" integer DEFAULT 2555 NOT NULL,
	"legal_hold_allowed" boolean DEFAULT true NOT NULL,
	"purge_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "export_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" uuid NOT NULL,
	"signer_subject" varchar(255) NOT NULL,
	"cert_fingerprint_sha256" varchar(128) NOT NULL,
	"cert_chain_pem" text NOT NULL,
	"signature_bytes_base64" text,
	"signature_ref" varchar(512),
	"timestamp_token_base64" text,
	"timestamped_at" timestamp with time zone,
	"ocsp_responses_base64" text,
	"crl_data_base64" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"user_id" uuid NOT NULL,
	"export_type" varchar(128) NOT NULL,
	"format" varchar(8) NOT NULL,
	"params_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_name" varchar(255),
	"mime_type" varchar(128),
	"size_bytes" integer,
	"sha256_hash" varchar(128),
	"verification_token" varchar(128) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"is_signed" boolean DEFAULT false NOT NULL,
	"pdfa_level" varchar(32),
	"signature_profile" varchar(64),
	"signing_status" varchar(16) DEFAULT 'queued' NOT NULL,
	"signed_at" timestamp with time zone,
	"signed_by_user_id" uuid,
	"tsa_status" varchar(16) DEFAULT 'queued' NOT NULL,
	"tsa_provider" varchar(255),
	"verification_level" varchar(32) DEFAULT 'basic' NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"legal_hold_reason" text,
	"retention_until" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "export_outbox" ADD CONSTRAINT "export_outbox_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "export_signatures" ADD CONSTRAINT "export_signatures_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_audit_events_export_id_created_idx" ON "export_audit_events" USING btree ("export_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_audit_events_event_type_idx" ON "export_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_outbox_run_after_locked_idx" ON "export_outbox" USING btree ("run_after","locked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_outbox_export_id_idx" ON "export_outbox" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_outbox_stage_run_after_idx" ON "export_outbox" USING btree ("stage","run_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_retention_policies_export_type_idx" ON "export_retention_policies" USING btree ("export_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_signatures_export_id_idx" ON "export_signatures" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_signatures_cert_fingerprint_idx" ON "export_signatures" USING btree ("cert_fingerprint_sha256");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_company_branch_created_idx" ON "exports" USING btree ("company_id","branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_user_created_idx" ON "exports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_status_created_idx" ON "exports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_verification_token_idx" ON "exports" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_expires_at_idx" ON "exports" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_signing_status_idx" ON "exports" USING btree ("signing_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_verification_level_idx" ON "exports" USING btree ("verification_level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_retention_until_idx" ON "exports" USING btree ("retention_until");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
