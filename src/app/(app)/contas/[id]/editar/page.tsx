import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { Card } from "@/components/ui";
import { AccountForm } from "../../account-form";
import { ExcluirContaButton } from "./excluir";

export const metadata = { title: "Editar conta · Build Money" };

export default async function EditarContaPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { ledgerId } = await requireAccess();

  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) notFound();
  // Contas internas do sistema não são editáveis pelo usuário.
  if (conta.isReimbursementPool || conta.isInvestmentPool) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/contas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Contas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Editar conta</h1>
      </div>

      <AccountForm
        mode="edit"
        accountId={conta.id}
        initial={{
          name: conta.name,
          type: conta.type,
          currency: conta.currency,
          institution: conta.institution ?? "",
          openingBalance: conta.openingBalance,
          creditLimit: conta.creditLimit,
          statementClosingDay: conta.statementClosingDay,
          paymentDueDay: conta.paymentDueDay,
          bankId: conta.icon ?? "",
        }}
      />

      <Card className="space-y-3 border-expense/40 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-expense">
          <AlertTriangle className="size-4" />
          Excluir conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Só é possível excluir uma conta sem lançamentos. Com histórico, os relatórios
          dependem dela — nesse caso, mantenha-a cadastrada.
        </p>
        <ExcluirContaButton id={conta.id} nome={conta.name} />
      </Card>
    </div>
  );
}
