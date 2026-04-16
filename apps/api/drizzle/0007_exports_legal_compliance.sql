ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "is_signed" boolean DEFAULT false NOT NULL;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "pdfa_level" varchar(32);
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "signature_profile" varchar(64);
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "signing_status" varchar(16) DEFAULT 'queued' NOT NULL;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "signed_at" timestamp with time zone;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "signed_by_user_id" uuid;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "tsa_status" varchar(16) DEFAULT 'queued' NOT NULL;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "tsa_provider" varchar(255);
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "verification_level" varchar(32) DEFAULT 'basic' NOT NULL;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "legal_hold_reason" text;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "retention_until" timestamp with time zone;
ALTER TABLE "exports" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;

ALTER TABLE "export_outbox" ADD COLUMN IF NOT EXISTS "stage" varchar(32) DEFAULT 'generate' NOT NULL;
ALTER TABLE "export_outbox" ADD COLUMN IF NOT EXISTS "artifact_path" varchar(512);

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

CREATE TABLE IF NOT EXISTS "export_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_type" varchar(128) NOT NULL,
	"retention_days" integer DEFAULT 2555 NOT NULL,
	"legal_hold_allowed" boolean DEFAULT true NOT NULL,
	"purge_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "export_signatures" ADD CONSTRAINT "export_signatures_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "exports_signing_status_idx" ON "exports" USING btree ("signing_status","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "exports_verification_level_idx" ON "exports" USING btree ("verification_level","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "exports_retention_until_idx" ON "exports" USING btree ("retention_until");
CREATE INDEX IF NOT EXISTS "export_outbox_stage_run_after_idx" ON "export_outbox" USING btree ("stage","run_after");
CREATE INDEX IF NOT EXISTS "export_signatures_export_id_idx" ON "export_signatures" USING btree ("export_id");
CREATE INDEX IF NOT EXISTS "export_signatures_cert_fingerprint_idx" ON "export_signatures" USING btree ("cert_fingerprint_sha256");
CREATE INDEX IF NOT EXISTS "export_audit_events_export_id_created_idx" ON "export_audit_events" USING btree ("export_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "export_audit_events_event_type_idx" ON "export_audit_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "export_retention_policies_export_type_idx" ON "export_retention_policies" USING btree ("export_type");
