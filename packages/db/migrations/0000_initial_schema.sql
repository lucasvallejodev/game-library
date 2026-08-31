-- ============================================================================
-- HAND-EDITED. drizzle-kit generated everything between the two marker
-- comments; the blocks at the top and bottom are maintained by hand because
-- drizzle-kit cannot express extensions or partial indexes.
--
-- If this migration is ever regenerated, carry the hand-written parts forward.
-- See docs/database.md 6.
-- ============================================================================

-- pg_trgm backs the trigram indexes at the bottom of this file.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- >>> BEGIN drizzle-kit generated >>>
CREATE TYPE "public"."asset_source" AS ENUM('igdb', 'upload');--> statement-breakpoint
CREATE TYPE "public"."storage_driver" AS ENUM('s3', 'local');--> statement-breakpoint
CREATE TYPE "public"."wishlist_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_driver" "storage_driver" NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"checksum_sha256" char(64) NOT NULL,
	"source" "asset_source" NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_driver_key_uniq" UNIQUE("storage_driver","object_key")
);
--> statement-breakpoint
CREATE TABLE "game_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"igdb_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" char(7) NOT NULL,
	"logo_asset_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_color_hex_chk" CHECK ("locations"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "game_genres" (
	"game_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "game_genres_game_id_genre_id_pk" PRIMARY KEY("game_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "game_locations" (
	"game_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_locations_game_id_location_id_pk" PRIMARY KEY("game_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"sort_name" text GENERATED ALWAYS AS (regexp_replace(name, '^(the|a|an)\s+', '', 'i')) STORED NOT NULL,
	"summary" text,
	"release_date" date,
	"igdb_rating" numeric(4, 1),
	"game_type_id" uuid,
	"cover_asset_id" uuid,
	"notes" text,
	"acquired_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item_genres" (
	"wishlist_item_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "wishlist_item_genres_wishlist_item_id_genre_id_pk" PRIMARY KEY("wishlist_item_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"sort_name" text GENERATED ALWAYS AS (regexp_replace(name, '^(the|a|an)\s+', '', 'i')) STORED NOT NULL,
	"summary" text,
	"release_date" date,
	"game_type_id" uuid,
	"cover_asset_id" uuid,
	"priority" "wishlist_priority" DEFAULT 'medium' NOT NULL,
	"target_price" numeric(10, 2),
	"currency" char(3),
	"store_url" text,
	"notes" text,
	"promoted_game_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_locations" ADD CONSTRAINT "game_locations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_locations" ADD CONSTRAINT "game_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_cover_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item_genres" ADD CONSTRAINT "wishlist_item_genres_wishlist_item_id_wishlist_items_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item_genres" ADD CONSTRAINT "wishlist_item_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_cover_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_promoted_game_id_games_id_fk" FOREIGN KEY ("promoted_game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_uniq" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uniq" ON "session" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uniq" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "media_assets_user_idx" ON "media_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_assets_checksum_idx" ON "media_assets" USING btree ("user_id","checksum_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "game_types_user_slug_uniq" ON "game_types" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "genres_user_slug_uniq" ON "genres" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "genres_user_igdb_idx" ON "genres" USING btree ("user_id","igdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_user_slug_uniq" ON "locations" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "locations_user_sort_idx" ON "locations" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "game_genres_genre_idx" ON "game_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "game_locations_location_idx" ON "game_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "games_user_sort_name_idx" ON "games" USING btree ("user_id","sort_name");--> statement-breakpoint
CREATE INDEX "games_user_type_idx" ON "games" USING btree ("user_id","game_type_id");--> statement-breakpoint
CREATE INDEX "games_user_created_idx" ON "games" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wishlist_item_genres_genre_idx" ON "wishlist_item_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "wishlist_user_sort_name_idx" ON "wishlist_items" USING btree ("user_id","sort_name");--> statement-breakpoint
CREATE INDEX "wishlist_user_priority_idx" ON "wishlist_items" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "wishlist_user_type_idx" ON "wishlist_items" USING btree ("user_id","game_type_id");--> statement-breakpoint
-- <<< END drizzle-kit generated <<<

-- ---------------------------------------------------------------------------
-- Duplicate-purchase guard (docs/database.md 3.5, 3.8).
--
-- Partial unique indexes: one user cannot hold the same IGDB title twice,
-- while any number of manually added rows (igdb_id IS NULL) stay allowed.
-- A plain UNIQUE would treat every NULL as distinct in Postgres, so it would
-- not prevent the duplicate -- and a NOT NULL column would ban manual entries.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "games_user_igdb_uniq" ON "games" USING btree ("user_id","igdb_id") WHERE "igdb_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_igdb_uniq" ON "wishlist_items" USING btree ("user_id","igdb_id") WHERE "igdb_id" IS NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Trigram indexes turn `name ILIKE '%witcher%'` into an index scan instead of
-- a sequential scan. This is the Library/Wishlist name filter.
-- ---------------------------------------------------------------------------
CREATE INDEX "games_name_trgm_idx" ON "games" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "wishlist_name_trgm_idx" ON "wishlist_items" USING gin ("name" gin_trgm_ops);
