ALTER TABLE "recurring_rules" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "default_payment_account_id" uuid;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_default_payment_account_id_accounts_id_fk" FOREIGN KEY ("default_payment_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;