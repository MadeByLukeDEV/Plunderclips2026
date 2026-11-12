-- Backfill first so the constraint can't fail on existing rows.
UPDATE "clip" SET "approved_at" = coalesce("reviewed_at", "created_at") WHERE "status" = 'approved' AND "approved_at" IS NULL;--> statement-breakpoint
ALTER TABLE "clip" ADD CONSTRAINT "clip_approved_has_date" CHECK ("clip"."status" <> 'approved' or "clip"."approved_at" is not null);