CREATE TABLE IF NOT EXISTS "health_check" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "status" varchar(20) DEFAULT 'ok' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
