-- Phase 5: Add phone and push token columns for SMS/Push notification delivery
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);
ALTER TABLE "users" ADD COLUMN "fcm_token" varchar(512);
