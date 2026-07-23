CREATE TYPE "public"."reimbursable_status" AS ENUM('open', 'settled');--> statement-breakpoint
CREATE TABLE "reimbursables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"description" text NOT NULL,
	"person_name" text,
	"amount" bigint NOT NULL,
	"settled_amount" bigint DEFAULT 0 NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" "currency_code" DEFAULT 'BRL' NOT NULL,
	"status" "reimbursable_status" DEFAULT 'open' NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_reimbursement_pool" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursables" ADD CONSTRAINT "reimbursables_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursables" ADD CONSTRAINT "reimbursables_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursables_ledger_idx" ON "reimbursables" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "reimbursables_ledger_status_idx" ON "reimbursables" USING btree ("ledger_id","status");