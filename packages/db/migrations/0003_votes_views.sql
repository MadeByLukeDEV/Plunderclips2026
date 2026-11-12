CREATE TABLE "clip_vote" (
	"clip_id" text NOT NULL,
	"voter_key" text NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clip_vote_clip_id_voter_key_pk" PRIMARY KEY("clip_id","voter_key")
);
--> statement-breakpoint
ALTER TABLE "clip" ADD COLUMN "vote_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clip" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_vote" ADD CONSTRAINT "clip_vote_clip_id_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_vote" ADD CONSTRAINT "clip_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clip_vote_created_idx" ON "clip_vote" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clip_vote_user_idx" ON "clip_vote" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clip_top_idx" ON "clip" USING btree ("vote_count","id") WHERE "clip"."status" = 'approved';