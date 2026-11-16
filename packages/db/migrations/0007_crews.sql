CREATE TYPE "public"."crew_join_policy" AS ENUM('open', 'request');--> statement-breakpoint
CREATE TYPE "public"."crew_role" AS ENUM('captain', 'officer', 'deckhand');--> statement-breakpoint
CREATE TABLE "crew" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"motto" text DEFAULT '' NOT NULL,
	"banner" text DEFAULT 'ninth-wave' NOT NULL,
	"join_policy" "crew_join_policy" DEFAULT 'request' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crew_slug_lower" CHECK ("crew"."slug" = lower("crew"."slug"))
);
--> statement-breakpoint
CREATE TABLE "crew_member" (
	"crew_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "crew_role" DEFAULT 'deckhand' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crew_member_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crew_request" (
	"crew_id" text NOT NULL,
	"user_id" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crew_request_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "crew_member" ADD CONSTRAINT "crew_member_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_member" ADD CONSTRAINT "crew_member_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_request" ADD CONSTRAINT "crew_request_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_request" ADD CONSTRAINT "crew_request_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_slug_idx" ON "crew" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "crew_members_idx" ON "crew" USING btree ("member_count");--> statement-breakpoint
CREATE INDEX "crew_member_user_idx" ON "crew_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_one_captain_idx" ON "crew_member" USING btree ("crew_id") WHERE "crew_member"."role" = 'captain';--> statement-breakpoint
CREATE INDEX "crew_request_user_idx" ON "crew_request" USING btree ("user_id");--> statement-breakpoint
-- member_count follows crew_member rows however they change (join, leave, account deleted). When a
-- captain's row goes without a hand-over (their account was deleted), the longest-serving officer,
-- else the longest-serving member, takes the helm. A crew with nobody left is removed.
CREATE OR REPLACE FUNCTION crew_member_sync() RETURNS trigger AS $$
DECLARE
  heir text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE crew SET member_count = member_count + 1 WHERE id = NEW.crew_id;
    RETURN NULL;
  END IF;
  UPDATE crew SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.crew_id;
  IF NOT EXISTS (SELECT 1 FROM crew_member WHERE crew_id = OLD.crew_id) THEN
    DELETE FROM crew WHERE id = OLD.crew_id;
  ELSIF OLD.role = 'captain'
    AND NOT EXISTS (SELECT 1 FROM crew_member WHERE crew_id = OLD.crew_id AND role = 'captain') THEN
    SELECT user_id INTO heir FROM crew_member
      WHERE crew_id = OLD.crew_id
      ORDER BY (role = 'officer') DESC, joined_at, user_id
      LIMIT 1;
    UPDATE crew_member SET role = 'captain' WHERE crew_id = OLD.crew_id AND user_id = heir;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER crew_member_sync AFTER INSERT OR DELETE ON crew_member
  FOR EACH ROW EXECUTE FUNCTION crew_member_sync();
