CREATE TYPE "public"."statement_status" AS ENUM('open', 'closed', 'paid', 'reparcelada');--> statement-breakpoint
CREATE TABLE "credit_card_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"closing_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "statement_status" DEFAULT 'closed' NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"reparcelado_plan_id" uuid,
	"closed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "kind" text DEFAULT 'purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "source_statement_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "statement_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "superseded_by_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cc_statements_account_idx" ON "credit_card_statements" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cc_statements_account_due_idx" ON "credit_card_statements" USING btree ("account_id","due_date");