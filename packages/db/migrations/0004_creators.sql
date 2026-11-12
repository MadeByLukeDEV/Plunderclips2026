CREATE TABLE "creator_channel" (
	"user_id" text NOT NULL,
	"platform" "clip_platform" NOT NULL,
	"handle" text NOT NULL,
	CONSTRAINT "creator_channel_user_id_platform_pk" PRIMARY KEY("user_id","platform")
);
--> statement-breakpoint
CREATE TABLE "creator_follow" (
	"follower_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_follow_follower_id_creator_id_pk" PRIMARY KEY("follower_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "creator_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"banner" text DEFAULT 'ninth-wave' NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profile_handle_lower" CHECK ("creator_profile"."handle" = lower("creator_profile"."handle"))
);
--> statement-breakpoint
ALTER TABLE "creator_channel" ADD CONSTRAINT "creator_channel_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_follow" ADD CONSTRAINT "creator_follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_follow" ADD CONSTRAINT "creator_follow_creator_id_creator_profile_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profile" ADD CONSTRAINT "creator_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_channel_lookup_idx" ON "creator_channel" USING btree ("platform","handle");--> statement-breakpoint
CREATE INDEX "creator_follow_creator_idx" ON "creator_follow" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_profile_handle_idx" ON "creator_profile" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "creator_profile_followers_idx" ON "creator_profile" USING btree ("follower_count");--> statement-breakpoint
-- follower_count follows creator_follow rows however they change (follow, unfollow, account deleted).
CREATE OR REPLACE FUNCTION creator_follow_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE creator_profile SET follower_count = follower_count + 1 WHERE user_id = NEW.creator_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE creator_profile SET follower_count = greatest(follower_count - 1, 0) WHERE user_id = OLD.creator_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER creator_follow_count_trg AFTER INSERT OR DELETE ON creator_follow
  FOR EACH ROW EXECUTE FUNCTION creator_follow_count();
