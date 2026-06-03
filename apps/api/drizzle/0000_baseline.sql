CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" varchar(128) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"actor_user_id" uuid,
	"company_id" uuid,
	"ip" varchar(45),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_check" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"fcm_token" varchar(512),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"code" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"resource" varchar(128) NOT NULL,
	"action" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"token" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_branches" (
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
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(512),
	"manager" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(64) NOT NULL,
	"price_per_unit" numeric(18, 2) NOT NULL,
	"unit" varchar(16) DEFAULT 'L' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tanks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"product_id" uuid,
	"capacity" numeric(18, 3) NOT NULL,
	"min_level" numeric(18, 3) DEFAULT '0' NOT NULL,
	"max_level" numeric(18, 3) NOT NULL,
	"current_level" numeric(18, 3) DEFAULT '0' NOT NULL,
	"calibration_profile" varchar(64),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pumps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"station_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nozzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"station_id" uuid NOT NULL,
	"pump_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"type" varchar(20) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"opened_by" uuid,
	"closed_by" uuid,
	"total_expected_amount" numeric(18, 2),
	"total_collected_amount" numeric(18, 2),
	"variance_amount" numeric(18, 2),
	"variance_reason" varchar(512),
	"submitted_for_approval_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"shift_id" uuid NOT NULL,
	"nozzle_id" uuid NOT NULL,
	"reading_type" varchar(16) NOT NULL,
	"value" numeric(18, 3) NOT NULL,
	"price_per_unit" numeric(18, 2)
);
--> statement-breakpoint
CREATE TABLE "shift_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"shift_id" uuid NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"receipt_number" varchar(64) NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0',
	"discount_reason" varchar(512),
	"payment_type" varchar(32),
	"shift_id" uuid,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"sale_transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT '0',
	"total_amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"sale_transaction_id" uuid NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	CONSTRAINT "sale_payments_amount_positive" CHECK ("sale_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"sale_transaction_id" uuid NOT NULL,
	"receipt_number" varchar(64) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"content_html" text
);
--> statement-breakpoint
CREATE TABLE "tank_dips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"dip_date" timestamp with time zone NOT NULL,
	"volume" numeric(18, 3) NOT NULL,
	"water_level" numeric(18, 3),
	"temperature" numeric(8, 2)
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"reconciliation_date" timestamp with time zone NOT NULL,
	"shift_id" uuid,
	"expected_volume" numeric(18, 3),
	"actual_volume" numeric(18, 3),
	"variance" numeric(18, 3),
	"notes" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"tank_id" uuid,
	"variance_date" timestamp with time zone NOT NULL,
	"volume_variance" numeric(18, 3) NOT NULL,
	"value_variance" numeric(18, 2),
	"classification" varchar(64),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inventory_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"value" varchar(255) NOT NULL,
	"company_id" uuid,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
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
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"delivery_note" varchar(128) NOT NULL,
	"supplier_id" uuid,
	"vehicle_no" varchar(64),
	"driver_name" varchar(255),
	"product_id" uuid,
	"ordered_qty" numeric(18, 3) NOT NULL,
	"expected_date" timestamp with time zone NOT NULL,
	"received_qty" numeric(18, 3),
	"density" numeric(10, 4),
	"temperature" numeric(8, 2),
	"status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"delivery_id" uuid NOT NULL,
	"grn_number" varchar(64) NOT NULL,
	"received_qty" numeric(18, 3) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"density" numeric(10, 4),
	"temperature" numeric(8, 2),
	"variance_reason" varchar(512),
	"status" varchar(20) DEFAULT 'posted' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"grn_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"transfer_type" varchar(32) NOT NULL,
	"from_tank_id" uuid,
	"to_tank_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"transfer_date" timestamp with time zone NOT NULL,
	"reference" varchar(128),
	"status" varchar(20) DEFAULT 'completed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"adjustment_date" timestamp with time zone NOT NULL,
	"volume_delta" numeric(18, 3) NOT NULL,
	"reason" varchar(64) NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"approval_request_id" uuid
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(64),
	"address" varchar(512),
	"tax_id" varchar(64),
	"credit_limit" numeric(18, 2) NOT NULL,
	"payment_terms" varchar(32) NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"invoice_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"balance_remaining" numeric(18, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"tax" numeric(18, 2) DEFAULT '0',
	"total" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_number" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"method" varchar(32) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"reference_no" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
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
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(64),
	"avg_variance" numeric(10, 4),
	"rating" varchar(32),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"invoice_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"balance_remaining" numeric(18, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"method" varchar(32) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"reference_no" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_allocations" (
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
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(512),
	"status" varchar(20) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"entry_number" varchar(64) NOT NULL,
	"category_id" uuid,
	"category" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"vendor" varchar(255) NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"description" varchar(1024),
	"billable_department" varchar(128),
	"attachment_name" varchar(255),
	"rejection_reason" varchar(512),
	"status" varchar(20) DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"transaction_type" varchar(16) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category" varchar(64),
	"notes" varchar(512) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_policies" (
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
CREATE TABLE "governance_approval_requests" (
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
CREATE TABLE "governance_approval_steps" (
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
CREATE TABLE "governance_approvals_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_user_id" uuid,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
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
CREATE TABLE "notification_outbox" (
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
CREATE TABLE "notification_preferences" (
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
CREATE TABLE "notifications" (
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
CREATE TABLE "notification_thresholds" (
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
CREATE TABLE "export_audit_events" (
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
CREATE TABLE "export_outbox" (
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
CREATE TABLE "export_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_type" varchar(128) NOT NULL,
	"retention_days" integer DEFAULT 2555 NOT NULL,
	"legal_hold_allowed" boolean DEFAULT true NOT NULL,
	"purge_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_signatures" (
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
CREATE TABLE "exports" (
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
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pumps" ADD CONSTRAINT "pumps_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_pump_id_pumps_id_fk" FOREIGN KEY ("pump_id") REFERENCES "public"."pumps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_nozzle_id_nozzles_id_fk" FOREIGN KEY ("nozzle_id") REFERENCES "public"."nozzles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_collections" ADD CONSTRAINT "shift_collections_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("sale_transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("sale_transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_sale_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("sale_transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tank_dips" ADD CONSTRAINT "tank_dips_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tank_dips" ADD CONSTRAINT "tank_dips_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tank_dips" ADD CONSTRAINT "tank_dips_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variances" ADD CONSTRAINT "variances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variances" ADD CONSTRAINT "variances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variances" ADD CONSTRAINT "variances_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_settings" ADD CONSTRAINT "inventory_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_allocations" ADD CONSTRAINT "grn_allocations_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_allocations" ADD CONSTRAINT "grn_allocations_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_tank_id_tanks_id_fk" FOREIGN KEY ("from_tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_tank_id_tanks_id_fk" FOREIGN KEY ("to_tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_invoices" ADD CONSTRAINT "credit_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_invoices" ADD CONSTRAINT "credit_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_invoices" ADD CONSTRAINT "credit_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_credit_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."credit_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_credit_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."credit_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_ledger" ADD CONSTRAINT "petty_cash_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_ledger" ADD CONSTRAINT "petty_cash_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_policies" ADD CONSTRAINT "governance_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approval_requests" ADD CONSTRAINT "governance_approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approval_steps" ADD CONSTRAINT "governance_approval_steps_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approval_steps" ADD CONSTRAINT "governance_approval_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approvals_audit" ADD CONSTRAINT "governance_approvals_audit_approval_request_id_governance_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."governance_approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_approvals_audit" ADD CONSTRAINT "governance_approvals_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_thresholds" ADD CONSTRAINT "notification_thresholds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_thresholds" ADD CONSTRAINT "notification_thresholds_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_audit_events" ADD CONSTRAINT "export_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_outbox" ADD CONSTRAINT "export_outbox_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_signatures" ADD CONSTRAINT "export_signatures_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_company_id_idx" ON "audit_log" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_unique" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_unique" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_unique" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_perm_unique" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_branches_user_branch_unique" ON "user_branches" USING btree ("user_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_code_unique" ON "companies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_company_code_unique" ON "stations" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "stations_company_id_idx" ON "stations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "stations_status_idx" ON "stations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_station_code_unique" ON "branches" USING btree ("station_id","code");--> statement-breakpoint
CREATE INDEX "branches_station_id_idx" ON "branches" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "branches_company_id_idx" ON "branches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "branches_status_idx" ON "branches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_company_code_unique" ON "products" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "products_company_id_idx" ON "products" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tanks_branch_code_unique" ON "tanks" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "tanks_company_id_idx" ON "tanks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tanks_branch_id_idx" ON "tanks" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "tanks_product_id_idx" ON "tanks" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pumps_station_code_unique" ON "pumps" USING btree ("station_id","code");--> statement-breakpoint
CREATE INDEX "pumps_station_id_idx" ON "pumps" USING btree ("station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nozzles_station_code_unique" ON "nozzles" USING btree ("station_id","code");--> statement-breakpoint
CREATE INDEX "nozzles_station_id_idx" ON "nozzles" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "nozzles_pump_id_idx" ON "nozzles" USING btree ("pump_id");--> statement-breakpoint
CREATE INDEX "nozzles_tank_id_idx" ON "nozzles" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "nozzles_product_id_idx" ON "nozzles" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shifts_company_id_branch_id_idx" ON "shifts" USING btree ("company_id","branch_id");--> statement-breakpoint
CREATE INDEX "shifts_branch_id_status_idx" ON "shifts" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "shifts_station_id_idx" ON "shifts" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "shifts_status_idx" ON "shifts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shifts_start_time_idx" ON "shifts" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "shifts_company_branch_start_time_idx" ON "shifts" USING btree ("company_id","branch_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_open_per_branch_unique" ON "shifts" USING btree ("branch_id") WHERE "shifts"."status" = 'open' AND "shifts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shift_assignments_shift_id_idx" ON "shift_assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_assignments_user_id_idx" ON "shift_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meter_readings_shift_id_idx" ON "meter_readings" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "meter_readings_nozzle_id_idx" ON "meter_readings" USING btree ("nozzle_id");--> statement-breakpoint
CREATE INDEX "meter_readings_reading_type_idx" ON "meter_readings" USING btree ("reading_type");--> statement-breakpoint
CREATE INDEX "shift_collections_shift_id_idx" ON "shift_collections" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_collections_payment_method_idx" ON "shift_collections" USING btree ("payment_method");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_transactions_receipt_number_unique" ON "sales_transactions" USING btree ("company_id","receipt_number");--> statement-breakpoint
CREATE INDEX "sales_transactions_company_branch_date_idx" ON "sales_transactions" USING btree ("company_id","branch_id","transaction_date");--> statement-breakpoint
CREATE INDEX "sales_transactions_created_at_idx" ON "sales_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_transactions_status_idx" ON "sales_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_transactions_shift_id_idx" ON "sales_transactions" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_transaction_id_idx" ON "sale_items" USING btree ("sale_transaction_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_id_idx" ON "sale_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_transaction_id_idx" ON "sale_payments" USING btree ("sale_transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_sale_transaction_id_idx" ON "receipts" USING btree ("sale_transaction_id");--> statement-breakpoint
CREATE INDEX "receipts_receipt_number_idx" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "tank_dips_company_branch_date_idx" ON "tank_dips" USING btree ("company_id","branch_id","dip_date");--> statement-breakpoint
CREATE INDEX "tank_dips_tank_id_idx" ON "tank_dips" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "tank_dips_dip_date_idx" ON "tank_dips" USING btree ("dip_date");--> statement-breakpoint
CREATE INDEX "reconciliations_company_branch_date_idx" ON "reconciliations" USING btree ("company_id","branch_id","reconciliation_date");--> statement-breakpoint
CREATE INDEX "reconciliations_reconciliation_date_idx" ON "reconciliations" USING btree ("reconciliation_date");--> statement-breakpoint
CREATE INDEX "reconciliations_status_idx" ON "reconciliations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "variances_company_branch_date_idx" ON "variances" USING btree ("company_id","branch_id","variance_date");--> statement-breakpoint
CREATE INDEX "variances_variance_date_idx" ON "variances" USING btree ("variance_date");--> statement-breakpoint
CREATE INDEX "variances_tank_id_idx" ON "variances" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "variances_classification_idx" ON "variances" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "inventory_settings_key_branch_idx" ON "inventory_settings" USING btree ("key","branch_id");--> statement-breakpoint
CREATE INDEX "inventory_settings_company_id_idx" ON "inventory_settings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_company_branch_date_idx" ON "stock_ledger" USING btree ("company_id","branch_id","movement_date");--> statement-breakpoint
CREATE INDEX "stock_ledger_tank_id_idx" ON "stock_ledger" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_reference_idx" ON "stock_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "stock_ledger_movement_ref_date_idx" ON "stock_ledger" USING btree ("movement_type","reference_id","movement_date");--> statement-breakpoint
CREATE INDEX "deliveries_company_branch_date_idx" ON "deliveries" USING btree ("company_id","branch_id","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "grns_delivery_id_unique" ON "grns" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "grns_delivery_id_idx" ON "grns" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "grns_created_at_idx" ON "grns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "grn_allocations_grn_id_idx" ON "grn_allocations" USING btree ("grn_id");--> statement-breakpoint
CREATE INDEX "grn_allocations_tank_id_idx" ON "grn_allocations" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "transfers_company_branch_date_idx" ON "transfers" USING btree ("company_id","branch_id","transfer_date");--> statement-breakpoint
CREATE INDEX "transfers_from_tank_id_idx" ON "transfers" USING btree ("from_tank_id");--> statement-breakpoint
CREATE INDEX "transfers_to_tank_id_idx" ON "transfers" USING btree ("to_tank_id");--> statement-breakpoint
CREATE INDEX "transfers_status_idx" ON "transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "adjustments_company_branch_date_idx" ON "adjustments" USING btree ("company_id","branch_id","adjustment_date");--> statement-breakpoint
CREATE INDEX "adjustments_tank_id_idx" ON "adjustments" USING btree ("tank_id");--> statement-breakpoint
CREATE INDEX "adjustments_status_idx" ON "adjustments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_company_branch_code_unique" ON "customers" USING btree ("company_id","branch_id","code");--> statement-breakpoint
CREATE INDEX "customers_company_id_idx" ON "customers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customers_branch_id_idx" ON "customers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_invoices_company_branch_date_idx" ON "credit_invoices" USING btree ("company_id","branch_id","invoice_date");--> statement-breakpoint
CREATE INDEX "credit_invoices_customer_id_idx" ON "credit_invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "credit_invoices_status_idx" ON "credit_invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_invoices_company_invoice_number_unique" ON "credit_invoices" USING btree ("company_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_product_id_idx" ON "invoice_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "payments_company_branch_date_idx" ON "payments" USING btree ("company_id","branch_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_customer_id_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_company_code_unique" ON "suppliers" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "suppliers_company_id_idx" ON "suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_company_branch_date_idx" ON "supplier_invoices" USING btree ("company_id","branch_id","invoice_date");--> statement-breakpoint
CREATE INDEX "supplier_invoices_supplier_id_idx" ON "supplier_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoices_supplier_invoice_number_unique" ON "supplier_invoices" USING btree ("supplier_id","invoice_number");--> statement-breakpoint
CREATE INDEX "supplier_payments_company_branch_date_idx" ON "supplier_payments" USING btree ("company_id","branch_id","payment_date");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocations_payment_id_idx" ON "supplier_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocations_invoice_id_idx" ON "supplier_payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_company_branch_code_unique" ON "expense_categories" USING btree ("company_id","branch_id","code");--> statement-breakpoint
CREATE INDEX "expense_categories_company_id_idx" ON "expense_categories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "expense_categories_branch_id_idx" ON "expense_categories" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "expense_entries_company_branch_date_idx" ON "expense_entries" USING btree ("company_id","branch_id","created_at");--> statement-breakpoint
CREATE INDEX "expense_entries_status_idx" ON "expense_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "petty_cash_ledger_company_branch_date_idx" ON "petty_cash_ledger" USING btree ("company_id","branch_id","created_at");--> statement-breakpoint
CREATE INDEX "petty_cash_ledger_transaction_type_idx" ON "petty_cash_ledger" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "gov_policies_company_branch_entity_action_idx" ON "governance_policies" USING btree ("company_id","branch_id","entity_type","action_type");--> statement-breakpoint
CREATE INDEX "gov_policies_enabled_idx" ON "governance_policies" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "gov_approval_requests_scope_idx" ON "governance_approval_requests" USING btree ("company_id","branch_id","entity_type","action_type");--> statement-breakpoint
CREATE INDEX "gov_approval_requests_status_idx" ON "governance_approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gov_approval_requests_entity_idx" ON "governance_approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "gov_approval_steps_request_order_idx" ON "governance_approval_steps" USING btree ("approval_request_id","step_order");--> statement-breakpoint
CREATE INDEX "gov_approval_steps_status_idx" ON "governance_approval_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gov_approvals_audit_request_idx" ON "governance_approvals_audit" USING btree ("approval_request_id","created_at");--> statement-breakpoint
CREATE INDEX "gov_approvals_audit_event_idx" ON "governance_approvals_audit" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_id_read_at_created_at_idx" ON "notification_deliveries" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_unread_idx" ON "notification_deliveries" USING btree ("user_id","read_at","archived_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_run_after_locked_at_idx" ON "notification_outbox" USING btree ("run_after","locked_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_job_type_attempts_idx" ON "notification_outbox" USING btree ("job_type","attempts");--> statement-breakpoint
CREATE INDEX "notification_outbox_notification_id_idx" ON "notification_outbox" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_company_id_branch_id_created_at_idx" ON "notifications" USING btree ("company_id","branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_type_created_at_idx" ON "notifications" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_company_station_branch_idx" ON "notifications" USING btree ("company_id","station_id","branch_id");--> statement-breakpoint
CREATE INDEX "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_expires_at_idx" ON "notifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "export_audit_events_export_id_created_idx" ON "export_audit_events" USING btree ("export_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "export_audit_events_event_type_idx" ON "export_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "export_outbox_run_after_locked_idx" ON "export_outbox" USING btree ("run_after","locked_at");--> statement-breakpoint
CREATE INDEX "export_outbox_export_id_idx" ON "export_outbox" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "export_outbox_stage_run_after_idx" ON "export_outbox" USING btree ("stage","run_after");--> statement-breakpoint
CREATE INDEX "export_retention_policies_export_type_idx" ON "export_retention_policies" USING btree ("export_type");--> statement-breakpoint
CREATE INDEX "export_signatures_export_id_idx" ON "export_signatures" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "export_signatures_cert_fingerprint_idx" ON "export_signatures" USING btree ("cert_fingerprint_sha256");--> statement-breakpoint
CREATE INDEX "exports_company_branch_created_idx" ON "exports" USING btree ("company_id","branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_user_created_idx" ON "exports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_status_created_idx" ON "exports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_verification_token_idx" ON "exports" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX "exports_expires_at_idx" ON "exports" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "exports_signing_status_idx" ON "exports" USING btree ("signing_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_verification_level_idx" ON "exports" USING btree ("verification_level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_retention_until_idx" ON "exports" USING btree ("retention_until");