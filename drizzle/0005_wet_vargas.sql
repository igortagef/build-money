CREATE TYPE "public"."asset_kind" AS ENUM('fixed_income', 'variable_income', 'real_estate', 'vehicle', 'other');--> statement-breakpoint
CREATE TABLE "asset_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"value" bigint NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"detail" text,
	"invested_value" bigint DEFAULT 0 NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"currency" "currency_code" DEFAULT 'BRL' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_snapshots" ADD CONSTRAINT "asset_snapshots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_snapshots_asset_date_idx" ON "asset_snapshots" USING btree ("asset_id","date");--> statement-breakpoint
CREATE INDEX "assets_ledger_idx" ON "assets" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "assets_ledger_kind_idx" ON "assets" USING btree ("ledger_id","kind");