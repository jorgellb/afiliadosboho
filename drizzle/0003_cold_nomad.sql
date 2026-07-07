CREATE TABLE "product_tryon_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"category" text,
	"subcategory" text,
	"original_url" text,
	"clean_url" text,
	"anchor_point" text,
	"width_ratio" real,
	"colors" text[],
	"style_tags" text[],
	"vision_used" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_msg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "product_tryon_assets_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "shared_looks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"image_url" text NOT NULL,
	"product_ids" text[] NOT NULL,
	"slug" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_looks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stylist_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" uuid,
	"product_id" text NOT NULL,
	"reason" text,
	"clicked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tryon_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_photo_url" text NOT NULL,
	"result_url" text,
	"provider" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_msg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stylist_suggestions" ADD CONSTRAINT "stylist_suggestions_job_id_tryon_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."tryon_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_tryon_assets_status_idx" ON "product_tryon_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tryon_jobs_status_created_idx" ON "tryon_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tryon_jobs_session_idx" ON "tryon_jobs" USING btree ("session_id");