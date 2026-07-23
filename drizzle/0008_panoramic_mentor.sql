CREATE TABLE "asset_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "asset_kind_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_kinds" ADD CONSTRAINT "asset_kinds_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_kinds_ledger_idx" ON "asset_kinds" USING btree ("ledger_id");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_kind_id_asset_kinds_id_fk" FOREIGN KEY ("asset_kind_id") REFERENCES "public"."asset_kinds"("id") ON DELETE set null ON UPDATE no action;