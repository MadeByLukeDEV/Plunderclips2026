CREATE TYPE "public"."chat_kind" AS ENUM('crew', 'dm');--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'message';--> statement-breakpoint
CREATE TABLE "chat_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "chat_kind" NOT NULL,
	"crew_id" text,
	"dm_key" text,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_channel_shape" CHECK (("chat_channel"."kind" = 'crew' and "chat_channel"."crew_id" is not null and "chat_channel"."dm_key" is null) or ("chat_channel"."kind" = 'dm' and "chat_channel"."dm_key" is not null and "chat_channel"."crew_id" is null))
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "chat_participant" (
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "chat_participant_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_read" (
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_id" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_read_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "chat_channel" ADD CONSTRAINT "chat_channel_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_channel_id_chat_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_author_id_creator_profile_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participant" ADD CONSTRAINT "chat_participant_channel_id_chat_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_participant" ADD CONSTRAINT "chat_participant_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read" ADD CONSTRAINT "chat_read_channel_id_chat_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read" ADD CONSTRAINT "chat_read_user_id_creator_profile_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_profile"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channel_crew_idx" ON "chat_channel" USING btree ("crew_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channel_dm_idx" ON "chat_channel" USING btree ("dm_key");--> statement-breakpoint
CREATE INDEX "chat_message_channel_idx" ON "chat_message" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "chat_participant_user_idx" ON "chat_participant" USING btree ("user_id");