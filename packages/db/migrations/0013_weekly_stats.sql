CREATE TABLE "clip_stat_daily" (
	"clip_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "clip_stat_daily_clip_id_day_pk" PRIMARY KEY("clip_id","day")
);
--> statement-breakpoint
CREATE TABLE "section_exclusion" (
	"section_slug" text NOT NULL,
	"period" text NOT NULL,
	"clip_id" text NOT NULL,
	"excluded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "section_exclusion_section_slug_period_clip_id_pk" PRIMARY KEY("section_slug","period","clip_id")
);
--> statement-breakpoint
ALTER TABLE "clip_stat_daily" ADD CONSTRAINT "clip_stat_daily_clip_id_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_exclusion" ADD CONSTRAINT "section_exclusion_section_slug_section_slug_fk" FOREIGN KEY ("section_slug") REFERENCES "public"."section"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "section_exclusion" ADD CONSTRAINT "section_exclusion_clip_id_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_exclusion" ADD CONSTRAINT "section_exclusion_excluded_by_user_id_user_id_fk" FOREIGN KEY ("excluded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clip_stat_daily_day_idx" ON "clip_stat_daily" USING btree ("day");--> statement-breakpoint
-- The weekly section now fills itself from votes every hour (worker job weekly-rotation).
UPDATE "section" SET "blurb" = 'This week''s top clips, ranked by your votes and updated every hour.' WHERE "slug" = 'weekly' AND "blurb" = 'The week''s top clips, picked every Monday.';