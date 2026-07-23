import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getMeta } from "@/lib/goals";
import { EditGoalForm } from "./form";

export const metadata = { title: "Editar meta · Build Money" };

export default async function EditarMetaPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { ledgerId } = await requireAccess();

  const meta = await getMeta(ledgerId, id);
  if (!meta) notFound();

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
        <h1 className="text-2xl font-semibold tracking-tight">Editar meta</h1>
      </div>

      <EditGoalForm
        goalId={meta.id}
        currency={meta.currency}
        guardado={meta.guardado}
        initial={{
          name: meta.name,
          description: meta.description ?? "",
          targetAmount: meta.targetAmount,
          targetDate: meta.targetDate,
        }}
      />
    </div>
  );
}
