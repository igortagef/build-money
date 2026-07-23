CREATE TABLE "reimbursable_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reimbursable_id" uuid NOT NULL,
	"name" text,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reimbursables" ADD COLUMN "total_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursables" ADD COLUMN "my_share" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursable_participants" ADD CONSTRAINT "reimbursable_participants_reimbursable_id_reimbursables_id_fk" FOREIGN KEY ("reimbursable_id") REFERENCES "public"."reimbursables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursable_participants_racha_idx" ON "reimbursable_participants" USING btree ("reimbursable_id");