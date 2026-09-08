CREATE TABLE "digest_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text DEFAULT 'default' NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipients" jsonb NOT NULL,
	"subject" text,
	"biddable_count" integer DEFAULT 0 NOT NULL,
	"informational_count" integer DEFAULT 0 NOT NULL,
	"notice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_message_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text DEFAULT 'default' NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"posted_from" text NOT NULL,
	"posted_to" text NOT NULL,
	"naics_codes" jsonb NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"total_records_reported" integer,
	"capped_out" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"error_message" text,
	"request_log" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_states" (
	"organization_id" text DEFAULT 'default' NOT NULL,
	"user_id" uuid NOT NULL,
	"notice_id" text NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"saved_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_states_organization_id_user_id_notice_id_pk" PRIMARY KEY("organization_id","user_id","notice_id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"organization_id" text DEFAULT 'default' NOT NULL,
	"notice_id" text NOT NULL,
	"title" text NOT NULL,
	"solicitation_number" text,
	"type" text NOT NULL,
	"base_type" text,
	"track" text NOT NULL,
	"posted_date" date NOT NULL,
	"archive_date" date,
	"archive_type" text,
	"response_deadline" timestamp with time zone,
	"naics_code" text,
	"naics_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classification_code" text,
	"type_of_set_aside" text,
	"type_of_set_aside_description" text,
	"active" boolean DEFAULT true NOT NULL,
	"full_parent_path_name" text,
	"full_parent_path_code" text,
	"agency_top" text,
	"agency_office" text,
	"organization_type" text,
	"office_address" jsonb,
	"place_of_performance" jsonb,
	"pop_city" text,
	"pop_state" text,
	"pop_country" text,
	"point_of_contact" jsonb,
	"award" jsonb,
	"links" jsonb,
	"resource_links" jsonb,
	"description_url" text,
	"description_text" text,
	"description_fetched_at" timestamp with time zone,
	"additional_info_link" text,
	"ui_link" text,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"digest_sent_at" timestamp with time zone,
	CONSTRAINT "notices_organization_id_notice_id_pk" PRIMARY KEY("organization_id","notice_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text DEFAULT 'default' NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"digest_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notice_states" ADD CONSTRAINT "notice_states_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_states" ADD CONSTRAINT "notice_states_notice_fk" FOREIGN KEY ("organization_id","notice_id") REFERENCES "public"."notices"("organization_id","notice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "digest_sends_org_sent_idx" ON "digest_sends" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "ingest_runs_org_started_idx" ON "ingest_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "notice_states_dismissed_idx" ON "notice_states" USING btree ("organization_id","user_id","dismissed");--> statement-breakpoint
CREATE INDEX "notice_states_saved_idx" ON "notice_states" USING btree ("organization_id","user_id","saved");--> statement-breakpoint
CREATE INDEX "notices_org_deadline_idx" ON "notices" USING btree ("organization_id","response_deadline");--> statement-breakpoint
CREATE INDEX "notices_org_track_posted_idx" ON "notices" USING btree ("organization_id","track","posted_date");--> statement-breakpoint
CREATE INDEX "notices_org_posted_idx" ON "notices" USING btree ("organization_id","posted_date");--> statement-breakpoint
CREATE INDEX "notices_org_type_idx" ON "notices" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "notices_org_naics_idx" ON "notices" USING btree ("organization_id","naics_code");--> statement-breakpoint
CREATE INDEX "notices_org_set_aside_idx" ON "notices" USING btree ("organization_id","type_of_set_aside");--> statement-breakpoint
CREATE INDEX "notices_org_agency_idx" ON "notices" USING btree ("organization_id","agency_top");--> statement-breakpoint
CREATE INDEX "notices_pending_digest_idx" ON "notices" USING btree ("organization_id","posted_date") WHERE "notices"."digest_sent_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_idx" ON "users" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "users_org_digest_enabled_idx" ON "users" USING btree ("organization_id","digest_enabled");