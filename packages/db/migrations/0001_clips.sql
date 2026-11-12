CREATE TYPE "public"."clip_kind" AS ENUM('clip', 'video', 'short', 'live', 'post');--> statement-breakpoint
CREATE TYPE "public"."clip_platform" AS ENUM('twitch', 'youtube', 'kick', 'medal', 'tiktok', 'x');--> statement-breakpoint
CREATE TYPE "public"."clip_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "clip" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"platform" "clip_platform" NOT NULL,
	"kind" "clip_kind" NOT NULL,
	"platform_id" text NOT NULL,
	"channel" text,
	"canonical_url" text NOT NULL,
	"embed_src" text,
	"start_seconds" integer,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"author_name" text,
	"author_url" text,
	"duration_seconds" integer,
	"game" text,
	"is_sea_of_thieves" boolean,
	"status" "clip_status" DEFAULT 'pending' NOT NULL,
	"submitted_by_user_id" text,
	"submitter_ip_hash" text,
	"submitter_note" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"reject_reason" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clip_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "clip" ADD CONSTRAINT "clip_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip" ADD CONSTRAINT "clip_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clip_status_created_idx" ON "clip" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "clip_submitted_by_idx" ON "clip" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "clip_channel_idx" ON "clip" USING btree ("platform","channel");