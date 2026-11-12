CREATE TYPE "public"."section_kind" AS ENUM('weekly', 'curated');--> statement-breakpoint
CREATE TABLE "clip_section" (
	"clip_id" text NOT NULL,
	"section_slug" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_by_user_id" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clip_section_section_slug_period_clip_id_pk" PRIMARY KEY("section_slug","period","clip_id")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"blurb" text NOT NULL,
	"kind" "section_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_section" ADD CONSTRAINT "clip_section_clip_id_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_section" ADD CONSTRAINT "clip_section_section_slug_section_slug_fk" FOREIGN KEY ("section_slug") REFERENCES "public"."section"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "clip_section" ADD CONSTRAINT "clip_section_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clip_section_clip_idx" ON "clip_section" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "clip_approved_idx" ON "clip" USING btree ("approved_at","id") WHERE "clip"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "clip_tags_idx" ON "clip" USING gin ("tags");--> statement-breakpoint
-- Starting sections. Mods curate their clips; titles and blurbs can be edited later.
INSERT INTO "section" ("slug", "title", "blurb", "kind", "sort_order") VALUES
  ('weekly', 'This week', 'The week''s top clips, picked every Monday.', 'weekly', 0),
  ('best-of', 'Best of', 'All-time favourites the crew keeps rewatching.', 'curated', 1),
  ('featured', 'Featured', 'Hand-picked by the mods, with the streamer up front.', 'curated', 2)
ON CONFLICT ("slug") DO NOTHING;
