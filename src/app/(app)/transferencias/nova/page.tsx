import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { TransferForm } from "./form";

export const metadata = { title: "Transferência · Build Money" };

export default async function NovaTransferenciaPage(props: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await props.searchParams;
  const ehFatura = tipo === "fatura";
  const { ledgerId } = await requireAccess();

  const contas = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
    })
    .from(accounts)
    .where(and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        // As piscinas internas (rachas e investimentos) não entram: aportes e
        // resgates são feitos no Patrimônio, que mantém o ativo em sincronia.
        eq(accounts.isReimbursementPool, false),
        eq(accounts.isInvestmentPool, false),
      ))
    .orderBy(asc(accounts.name));

  // Transferência precisa de pelo menos duas contas.
  if (contas.length < 2) redirect("/contas/nova");

  // Pagamento de fatura precisa de um cartão e de uma conta não-cartão.
  const temCartao = contas.some((c) => c.type === "credit_card");
  const temOutra = contas.some((c) => c.type !== "credit_card");
  if (ehFatura && (!temCartao || !temOutra)) {
    redirect("/transferencias/nova");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-3">
        <Link
          href="/lancamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Lançamentos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ehFatura ? "Pagar fatura do cartão" : "Transferência entre contas"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ehFatura
            ? "Registre o pagamento da fatura. O valor sai da sua conta e abate o saldo do cartão."
            : "Mova dinheiro entre suas contas. Não entra como receita nem despesa — é só troca de lugar."}
        </p>
      </div>

      <TransferForm
        contas={contas}
        hoje={new Date().toISOString().slice(0, 10)}
        preset={ehFatura ? "fatura" : "transferencia"}
      />
    </div>
  );
}
