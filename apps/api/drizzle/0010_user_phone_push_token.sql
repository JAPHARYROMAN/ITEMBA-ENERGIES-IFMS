-- Phase 5: Add phone and push token columns for SMS/Push notification delivery
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fcm_token" varchar(512);
