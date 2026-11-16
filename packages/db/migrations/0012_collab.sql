CREATE TYPE "public"."board_status" AS ENUM('idea', 'planned', 'done');--> statement-breakpoint
CREATE TYPE "public"."lfc_platform" AS ENUM('pc', 'xbox', 'playstation', 'any');--> statement-breakpoint
CREATE TYPE "public"."lfc_region" AS ENUM('eu', 'na', 'sa', 'oce', 'asia', 'any');--> statement-breakpoint
CREATE TYPE "public"."lfc_ship" AS ENUM('sloop', 'brigantine', 'galleon', 'any');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'maybe');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'session_scheduled';--> statement-breakpoint
CREATE TABLE "crew_board_item" (
	"id" text PRIMARY KEY NOT NULL,
	"crew_id" text NOT NULL,
	"author_id" text,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "board_status" DEFAULT 'idea' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_session" (
	"id" text PRIMARY KEY NOT NULL,
	"crew_id" text NOT NULL,
	"created_by" text,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 120 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_session_rsvp" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "rsvp_status" NOT NULL,
	CONSTRAINT "crew_session_rsvp_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "lfc_post" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"crew_id" text,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"region" "lfc_region" DEFAULT 'any' NOT NULL,
	"platform" "lfc_platform" DEFAULT 'any' NOT NULL,
	"ship" "lfc_ship" DEFAULT 'any' NOT NULL,
	"styles" text[] DEFAULT '{}'::text[] NOT NULL,
	"availability" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crew_board_item" ADD CONSTRAINT "crew_board_item_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_board_item" ADD CONSTRAINT "crew_board_item_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_session" ADD CONSTRAINT "crew_session_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_session" ADD CONSTRAINT "crew_session_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_session_rsvp" ADD CONSTRAINT "crew_session_rsvp_session_id_crew_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."crew_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_session_rsvp" ADD CONSTRAINT "crew_session_rsvp_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfc_post" ADD CONSTRAINT "lfc_post_author_id_creator_profile_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lfc_post" ADD CONSTRAINT "lfc_post_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_board_crew_idx" ON "crew_board_item" USING btree ("crew_id","status");--> statement-breakpoint
CREATE INDEX "crew_session_crew_idx" ON "crew_session" USING btree ("crew_id","starts_at");--> statement-breakpoint
CREATE INDEX "lfc_post_expires_idx" ON "lfc_post" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "lfc_post_author_idx" ON "lfc_post" USING btree ("author_id");