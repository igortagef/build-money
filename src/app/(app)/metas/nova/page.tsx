import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { NewGoalForm } from "./form";

export const metadata = { title: "Nova meta · Build Money" };

export default async function NovaMetaPage() {
  const { baseCurrency } = await requireAccess();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/metas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Metas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nova meta</h1>
      </div>

      <NewGoalForm baseCurrency={baseCurrency} />
    </div>
  );
}
