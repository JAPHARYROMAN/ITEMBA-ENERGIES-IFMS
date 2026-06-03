CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" DROP CONSTRAINT "shifts_opened_by_users_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" DROP CONSTRAINT "shifts_closed_by_users_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" DROP CONSTRAINT "shifts_approved_by_users_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_transactions" DROP CONSTRAINT "sales_transactions_voided_by_users_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "company_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fcm_token" varchar(512);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "adjustments" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "adjustments" ADD COLUMN IF NOT EXISTS "approval_request_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_branches_user_branch_unique" ON "user_branches" USING btree ("user_id","branch_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_company_id_idx" ON "audit_log" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_company_id_idx" ON "branches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shifts_company_branch_start_time_idx" ON "shifts" USING btree ("company_id","branch_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_transactions_receipt_number_unique" ON "sales_transactions" USING btree ("company_id","receipt_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_ledger_movement_ref_date_idx" ON "stock_ledger" USING btree ("movement_type","reference_id","movement_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adjustments_status_idx" ON "adjustments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_invoices_company_invoice_number_unique" ON "credit_invoices" USING btree ("company_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_supplier_invoice_number_unique" ON "supplier_invoices" USING btree ("supplier_id","invoice_number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_positive" CHECK ("sale_payments"."amount" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;