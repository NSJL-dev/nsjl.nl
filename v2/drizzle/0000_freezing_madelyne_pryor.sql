CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'completed', 'postponed', 'cancelled', 'awaiting_result');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'warning', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"external_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid,
	"team_season_id" uuid,
	"player_stat_id" uuid,
	"field_name" text NOT NULL,
	"numeric_value" numeric,
	"text_value" text,
	"date_value" date,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "override_exactly_one_target" CHECK (num_nonnulls("data_overrides"."match_id","data_overrides"."team_season_id","data_overrides"."player_stat_id")=1),
	CONSTRAINT "override_exactly_one_value" CHECK (num_nonnulls("data_overrides"."numeric_value","data_overrides"."text_value","data_overrides"."date_value")=1),
	CONSTRAINT "override_field_valid" CHECK ("data_overrides"."field_name" in ('scheduledDate','startTime','status','notes','homeScore','awayScore','position','wins','games','x01Ppd','cricketMpr'))
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"external_identifier" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text DEFAULT '' NOT NULL,
	"event_type" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_type_valid" CHECK ("events"."event_type" in ('training','tournament','team_event','other')),
	CONSTRAINT "event_dates_valid" CHECK ("events"."ends_at" is null or "events"."ends_at" >= "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "external_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"team_season_id" uuid NOT NULL,
	"external_identifier" text,
	"external_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"player_id" uuid,
	"first_seen_report_id" uuid,
	"last_seen_report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_player_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"origin_file" text NOT NULL,
	"claimed_competition_id" uuid,
	"claimed_season_id" uuid,
	"ppd" numeric(6, 2),
	"mpr" numeric(5, 2),
	"wins" integer,
	"hats" integer,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_result_sides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"forfeits" integer NOT NULL,
	"source_report_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_sides_numbers_valid" CHECK ("match_result_sides"."games" >= 0 and "match_result_sides"."wins" >= 0 and "match_result_sides"."losses" >= 0 and "match_result_sides"."forfeits" >= 0 and "match_result_sides"."wins"+"match_result_sides"."losses"="match_result_sides"."games")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"division_id" uuid NOT NULL,
	"week_number" integer,
	"round_key" text NOT NULL,
	"import_key" text NOT NULL,
	"pairing_number" integer DEFAULT 1 NOT NULL,
	"scheduled_date" date,
	"played_date" date,
	"start_time" time,
	"home_team_season_id" uuid,
	"away_team_season_id" uuid,
	"home_score" integer,
	"away_score" integer,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"venue_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"external_identifier" text,
	"result_report_id" uuid,
	"schedule_report_id" uuid,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_teams_differ" CHECK ("matches"."home_team_season_id" is null or "matches"."away_team_season_id" is null or "matches"."home_team_season_id" <> "matches"."away_team_season_id"),
	CONSTRAINT "matches_scores_valid" CHECK (("matches"."home_score" is null or "matches"."home_score" >= 0) and ("matches"."away_score" is null or "matches"."away_score" >= 0))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"bucket" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'private' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_size_positive" CHECK ("media"."size" > 0),
	CONSTRAINT "media_status_valid" CHECK ("media"."status" in ('private','published','archived'))
);
--> statement-breakpoint
CREATE TABLE "news_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"featured_media_id" uuid,
	"category" text NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"division_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"external_identifier" text,
	"external_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_season_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_player_id" uuid NOT NULL,
	"player_id" uuid,
	"team_season_id" uuid NOT NULL,
	"x01_ppd" numeric(6, 2),
	"x01_games" integer,
	"x01_wins" integer,
	"x01_hats" integer,
	"x01_3bd" integer,
	"x01_ton80" integer,
	"x01_hton" integer,
	"x01_lton" integer,
	"x01_6do" integer,
	"x01_7do" integer,
	"x01_8do" integer,
	"x01_9do" integer,
	"x01_10do" integer,
	"x01_11do" integer,
	"x01_12do" integer,
	"x01_13do" integer,
	"x01_14do" integer,
	"x01_15do" integer,
	"cricket_mpr" numeric(5, 2),
	"cricket_games" integer,
	"cricket_wins" integer,
	"cricket_assists" integer,
	"cricket_hats" integer,
	"cricket_whorse" integer,
	"cricket_5mr" integer,
	"cricket_6mr" integer,
	"cricket_7mr" integer,
	"cricket_8mr" integer,
	"cricket_9mr" integer,
	"source_report_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_stats_valid" CHECK (("player_season_stats"."x01_games" is null or "player_season_stats"."x01_games" >= 0) and ("player_season_stats"."x01_wins" is null or "player_season_stats"."x01_wins" between 0 and "player_season_stats"."x01_games") and ("player_season_stats"."cricket_games" is null or "player_season_stats"."cricket_games" >= 0) and ("player_season_stats"."cricket_wins" is null or "player_season_stats"."cricket_wins" between 0 and "player_season_stats"."cricket_games") and ("player_season_stats"."x01_ppd" is null or "player_season_stats"."x01_ppd" >= 0) and ("player_season_stats"."cricket_mpr" is null or "player_season_stats"."cricket_mpr" >= 0))
);
--> statement-breakpoint
CREATE TABLE "player_stats_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_player_id" uuid NOT NULL,
	"player_id" uuid,
	"team_season_id" uuid NOT NULL,
	"x01_ppd" numeric(6, 2),
	"x01_games" integer,
	"x01_wins" integer,
	"x01_hats" integer,
	"x01_3bd" integer,
	"x01_ton80" integer,
	"x01_hton" integer,
	"x01_lton" integer,
	"x01_6do" integer,
	"x01_7do" integer,
	"x01_8do" integer,
	"x01_9do" integer,
	"x01_10do" integer,
	"x01_11do" integer,
	"x01_12do" integer,
	"x01_13do" integer,
	"x01_14do" integer,
	"x01_15do" integer,
	"cricket_mpr" numeric(5, 2),
	"cricket_games" integer,
	"cricket_wins" integer,
	"cricket_assists" integer,
	"cricket_hats" integer,
	"cricket_whorse" integer,
	"cricket_5mr" integer,
	"cricket_6mr" integer,
	"cricket_7mr" integer,
	"cricket_8mr" integer,
	"cricket_9mr" integer,
	"source_report_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_team_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"joined_on" date,
	"left_on" date,
	"role" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_dates_valid" CHECK ("player_team_seasons"."left_on" is null or "player_team_seasons"."joined_on" is null or "player_team_seasons"."left_on" >= "player_team_seasons"."joined_on")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text NOT NULL,
	"nickname" text,
	"slug" text NOT NULL,
	"photo_media_id" uuid,
	"bio" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_dates_valid" CHECK ("seasons"."ends_at" is null or "seasons"."starts_at" is null or "seasons"."ends_at" >= "seasons"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_text" text,
	"value_number" numeric,
	"value_boolean" boolean,
	"value_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_exactly_one_value" CHECK (num_nonnulls("site_settings"."value_text","site_settings"."value_number","site_settings"."value_boolean","site_settings"."value_media_id")=1)
);
--> statement-breakpoint
CREATE TABLE "source_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"provider" text DEFAULT 'bullshooter' NOT NULL,
	"results_entry_url" text NOT NULL,
	"schedule_entry_url" text NOT NULL,
	"teaminfo_entry_url" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"expected_league_code" text NOT NULL,
	"expected_source_division" text DEFAULT 'A' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_config_id" uuid NOT NULL,
	"report_type" text NOT NULL,
	"discovered_url" text NOT NULL,
	"report_datetime_local" timestamp NOT NULL,
	"report_timezone" text,
	"reported_at_utc" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sha256" text NOT NULL,
	"parser_version" text NOT NULL,
	"snapshot_storage_path" text,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_type_valid" CHECK ("source_reports"."report_type" in ('results','schedule','teaminfo'))
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_media_id" uuid,
	"website_url" text,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_season_id" uuid NOT NULL,
	"position" integer,
	"position_basis" text DEFAULT 'source_order' NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer,
	"win_percentage" numeric(5, 2) NOT NULL,
	"source_report_id" uuid,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_numbers_valid" CHECK ("standings"."games" >= 0 and "standings"."wins" >= 0 and "standings"."wins" <= "standings"."games" and ("standings"."losses" is null or "standings"."losses" >= 0) and "standings"."win_percentage" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "standings_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_season_id" uuid NOT NULL,
	"position" integer,
	"position_basis" text DEFAULT 'source_order' NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer,
	"win_percentage" numeric(5, 2) NOT NULL,
	"source_report_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_locks" (
	"source_config_id" uuid PRIMARY KEY NOT NULL,
	"owner_run_id" uuid NOT NULL,
	"lease_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_config_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result_report_id" uuid,
	"schedule_report_id" uuid,
	"records_found" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"external_identifier" text,
	"is_primary_nsjl" boolean DEFAULT false NOT NULL,
	"venue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"slug" text NOT NULL,
	"is_nsjl" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"venue_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'NL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "team_seasons_id_division" ON "team_seasons" USING btree ("id","division_id");--> statement-breakpoint
--> statement-breakpoint
CREATE UNIQUE INDEX "external_players_id_team" ON "external_players" USING btree ("id","team_season_id");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_overrides" ADD CONSTRAINT "data_overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_overrides" ADD CONSTRAINT "data_overrides_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_overrides" ADD CONSTRAINT "data_overrides_player_stat_id_player_season_stats_id_fk" FOREIGN KEY ("player_stat_id") REFERENCES "public"."player_season_stats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_overrides" ADD CONSTRAINT "data_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_players" ADD CONSTRAINT "external_players_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_players" ADD CONSTRAINT "external_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_players" ADD CONSTRAINT "external_players_first_seen_report_id_source_reports_id_fk" FOREIGN KEY ("first_seen_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_players" ADD CONSTRAINT "external_players_last_seen_report_id_source_reports_id_fk" FOREIGN KEY ("last_seen_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_player_stats" ADD CONSTRAINT "legacy_player_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_player_stats" ADD CONSTRAINT "legacy_player_stats_claimed_competition_id_competitions_id_fk" FOREIGN KEY ("claimed_competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_player_stats" ADD CONSTRAINT "legacy_player_stats_claimed_season_id_seasons_id_fk" FOREIGN KEY ("claimed_season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_player_stats" ADD CONSTRAINT "legacy_player_stats_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_sides" ADD CONSTRAINT "match_result_sides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_sides" ADD CONSTRAINT "match_result_sides_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_result_sides" ADD CONSTRAINT "match_result_sides_source_report_id_source_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_result_report_id_source_reports_id_fk" FOREIGN KEY ("result_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_schedule_report_id_source_reports_id_fk" FOREIGN KEY ("schedule_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_season_id_division_id_team_seasons_id_division_id_fk" FOREIGN KEY ("home_team_season_id","division_id") REFERENCES "public"."team_seasons"("id","division_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_season_id_division_id_team_seasons_id_division_id_fk" FOREIGN KEY ("away_team_season_id","division_id") REFERENCES "public"."team_seasons"("id","division_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_team_season_id_division_id_team_seasons_id_division_id_fk" FOREIGN KEY ("team_season_id","division_id") REFERENCES "public"."team_seasons"("id","division_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_source_report_id_source_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_external_player_id_team_season_id_external_players_id_team_season_id_fk" FOREIGN KEY ("external_player_id","team_season_id") REFERENCES "public"."external_players"("id","team_season_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats_history" ADD CONSTRAINT "player_stats_history_external_player_id_external_players_id_fk" FOREIGN KEY ("external_player_id") REFERENCES "public"."external_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats_history" ADD CONSTRAINT "player_stats_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats_history" ADD CONSTRAINT "player_stats_history_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats_history" ADD CONSTRAINT "player_stats_history_source_report_id_source_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_team_seasons" ADD CONSTRAINT "player_team_seasons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_team_seasons" ADD CONSTRAINT "player_team_seasons_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_value_media_id_media_id_fk" FOREIGN KEY ("value_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_configs" ADD CONSTRAINT "source_configs_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_reports" ADD CONSTRAINT "source_reports_source_config_id_source_configs_id_fk" FOREIGN KEY ("source_config_id") REFERENCES "public"."source_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_source_report_id_source_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_history" ADD CONSTRAINT "standings_history_team_season_id_team_seasons_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_history" ADD CONSTRAINT "standings_history_source_report_id_source_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_locks" ADD CONSTRAINT "sync_locks_source_config_id_source_configs_id_fk" FOREIGN KEY ("source_config_id") REFERENCES "public"."source_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_source_config_id_source_configs_id_fk" FOREIGN KEY ("source_config_id") REFERENCES "public"."source_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_result_report_id_source_reports_id_fk" FOREIGN KEY ("result_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_schedule_report_id_source_reports_id_fk" FOREIGN KEY ("schedule_report_id") REFERENCES "public"."source_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aliases" ADD CONSTRAINT "team_aliases_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aliases" ADD CONSTRAINT "team_aliases_team_season_id_division_id_team_seasons_id_division_id_fk" FOREIGN KEY ("team_season_id","division_id") REFERENCES "public"."team_seasons"("id","division_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_aliases" ADD CONSTRAINT "venue_aliases_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_aliases" ADD CONSTRAINT "venue_aliases_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_slug_unique" ON "competitions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_context_unique" ON "divisions" USING btree ("season_id","slug");--> statement-breakpoint
CREATE INDEX "divisions_season_idx" ON "divisions" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_players_unique" ON "external_players" USING btree ("source","team_season_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "external_players_person_team" ON "external_players" USING btree ("player_id","team_season_id") WHERE "external_players"."player_id" is not null;--> statement-breakpoint
CREATE INDEX "external_players_team_idx" ON "external_players" USING btree ("team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_stats_origin_unique" ON "legacy_player_stats" USING btree ("player_id","origin_file");--> statement-breakpoint
CREATE UNIQUE INDEX "match_result_side_unique" ON "match_result_sides" USING btree ("match_id","team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_import_unique" ON "matches" USING btree ("source","division_id","import_key");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_slug_unique" ON "matches" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "matches_date_idx" ON "matches" USING btree ("division_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "media_path_unique" ON "media" USING btree ("bucket","storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "news_slug_unique" ON "news_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_publication_idx" ON "news_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_aliases_unique" ON "player_aliases" USING btree ("source","team_season_id","normalized_name");--> statement-breakpoint
CREATE INDEX "player_aliases_player_idx" ON "player_aliases" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_stats_external_unique" ON "player_season_stats" USING btree ("external_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_stats_person_team" ON "player_season_stats" USING btree ("player_id","team_season_id") WHERE "player_season_stats"."player_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "player_stats_history_unique" ON "player_stats_history" USING btree ("external_player_id","source_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_membership_unique" ON "player_team_seasons" USING btree ("player_id","team_season_id");--> statement-breakpoint
CREATE INDEX "memberships_team_idx" ON "player_team_seasons" USING btree ("team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_slug_unique" ON "players" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_context_unique" ON "seasons" USING btree ("competition_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_current" ON "seasons" USING btree ("competition_id") WHERE "seasons"."is_current";--> statement-breakpoint
CREATE INDEX "seasons_competition_idx" ON "seasons" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_configs_unique" ON "source_configs" USING btree ("provider","division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_reports_unique" ON "source_reports" USING btree ("source_config_id","report_type","sha256");--> statement-breakpoint
CREATE INDEX "source_reports_config_idx" ON "source_reports" USING btree ("source_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_team_unique" ON "standings" USING btree ("team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standings_history_unique" ON "standings_history" USING btree ("team_season_id","source_report_id");--> statement-breakpoint
CREATE INDEX "sync_runs_source_idx" ON "sync_runs" USING btree ("source_config_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_aliases_unique" ON "team_aliases" USING btree ("division_id","source","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_seasons_unique" ON "team_seasons" USING btree ("team_id","division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_seasons_primary" ON "team_seasons" USING btree ("division_id") WHERE "team_seasons"."is_primary_nsjl";--> statement-breakpoint
CREATE INDEX "team_seasons_division_idx" ON "team_seasons" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_unique" ON "teams" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_aliases_unique" ON "venue_aliases" USING btree ("competition_id","source","normalized_name");