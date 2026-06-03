CREATE TABLE IF NOT EXISTS "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"sale_transaction_id" uuid NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"value" varchar(255) NOT NULL,
	"company_id" uuid,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"product_id" uuid,
	"movement_type" varchar(32) NOT NULL,
	"reference_type" varchar(32) NOT NULL,
	"reference_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"movement_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"entity_type" varchar(64) NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"threshold_amount" numeric(18, 2),
	"threshold_pct" numeric(10, 4),
	"approval_steps_json" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" varchar(1024),
	"meta_json" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"approval_request_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"required_role" varchar(64),
	"required_permission" varchar(128),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" varchar(1024)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_approvals_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_user_id" uuid,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"read_at" timestamp,
	"seen_at" timestamp,
	"archived_at" timestamp,
	"delivered_via" varchar(16) NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"notification_id" uuid NOT NULL,
	"job_type" varchar(32) NOT NULL,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"locked_at" timestamp,
	"locked_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"channels_json" jsonb DEFAULT '{"inapp":true,"email":false,"sms":false,"push":false}'::jsonb NOT NULL,
	"severity_min" varchar(16) DEFAULT 'info' NOT NULL,
	"quiet_hours_json" jsonb,
	"digest_mode" varchar(16) DEFAULT 'none' NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid,
	"station_id" uuid,
	"type" varchar(32) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"data_json" jsonb,
	"action_url" varchar(512),
	"dedupe_key" varchar(255),
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "sales_transactions" ALTER COLUMN "payment_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD COLUMN "discount_amount" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD COLUMN "discount_reason" varchar(512);--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD COLUMN "void_reason" varchar(512);--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "tax_amount" numeric(18, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "density" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "temperature" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "variance_reason" varchar(512);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("sale_transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approval_steps" ADD CONSTRAINT "governance_approval_steps_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approval_steps" ADD CONSTRAINT "governance_approval_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approvals_audit" ADD CONSTRAINT "governance_approvals_audit_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governance_approvals_audit" ADD CONSTRAINT "governance_approvals_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_payments_sale_transaction_id_idx" ON "sale_payments" USING btree ("sale_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_settings_key_branch_idx" ON "inventory_settings" USING btree ("key","branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_settings_company_id_idx" ON "inventory_settings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_ledger_company_branch_date_idx" ON "stock_ledger" USING btree ("company_id","branch_id","movement_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_ledger_tank_id_idx" ON "stock_ledger" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_ledger_reference_idx" ON "stock_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_payment_id_idx" ON "supplier_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_invoice_id_idx" ON "supplier_payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_policies_company_branch_entity_action_idx" ON "governance_policies" USING btree ("company_id","branch_id","entity_type","action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_policies_enabled_idx" ON "governance_policies" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_requests_scope_idx" ON "governance_approval_requests" USING btree ("company_id","branch_id","entity_type","action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_requests_status_idx" ON "governance_approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_requests_entity_idx" ON "governance_approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_steps_request_order_idx" ON "governance_approval_steps" USING btree ("approval_request_id","step_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approval_steps_status_idx" ON "governance_approval_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approvals_audit_request_idx" ON "governance_approvals_audit" USING btree ("approval_request_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gov_approvals_audit_event_idx" ON "governance_approvals_audit" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_id_read_at_created_at_idx" ON "notification_deliveries" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_notification_id_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_status_created_at_idx" ON "notification_deliveries" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_unread_idx" ON "notification_deliveries" USING btree ("user_id","read_at","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_run_after_locked_at_idx" ON "notification_outbox" USING btree ("run_after","locked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_job_type_attempts_idx" ON "notification_outbox" USING btree ("job_type","attempts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_notification_id_idx" ON "notification_outbox" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_preferences_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_company_id_branch_id_created_at_idx" ON "notifications" USING btree ("company_id","branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_type_created_at_idx" ON "notifications" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_company_station_branch_idx" ON "notifications" USING btree ("company_id","station_id","branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx" ON "notifications" USING btree ("expires_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reconciliations_reconciliation_date_idx" ON "reconciliations" USING btree ("reconciliation_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variances_variance_date_idx" ON "variances" USING btree ("variance_date");