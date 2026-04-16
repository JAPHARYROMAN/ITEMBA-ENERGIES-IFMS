-- 0009: Account lockout after failed login attempts
-- Adds columns to users table for brute-force protection

ALTER TABLE "users"
  ADD COLUMN "failed_login_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" timestamp with time zone;

-- Index for efficient lockout queries during login
CREATE INDEX "users_locked_until_idx" ON "users" ("locked_until")
  WHERE "locked_until" IS NOT NULL;
