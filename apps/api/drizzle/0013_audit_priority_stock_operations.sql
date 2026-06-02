ALTER TABLE "sales_transactions"
  ALTER COLUMN "status" TYPE varchar(32);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "grns_delivery_id_unique"
  ON "grns" ("delivery_id");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "shifts_one_open_per_branch_unique"
  ON "shifts" ("branch_id")
  WHERE "status" = 'open' AND "deleted_at" IS NULL;
