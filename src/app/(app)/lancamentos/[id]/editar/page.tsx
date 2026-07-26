import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { NewTransactionForm, type LancamentoInicial } from "../../novo/form";

export const metadata = { title: "Editar lançamento · Build Money" };

/** Centavos -> texto do campo ("1234,56"), o mesmo formato que o usuário digita. */
function paraCampo(centavos: number) {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export default async function EditarLancamentoPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { ledgerId, baseCurrency } = await requireAccess();

  const [tx] = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      type: transactions.type,
      status: transactions.status,
      amount: transactions.amount,
      description: transactions.description,
      date: transactions.date,
      settlementDate: transactions.settlementDate,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)))
    .limit(1);

  if (!tx) notFound();

  // Transferência (usada por rachas, mais adiante) tem um editor próprio;
  // este form é de receita/despesa.
  if (tx.type === "transfer") redirect("/lancamentos");

  const splits = await db
    .select({
      categoryId: transactionSplits.categoryId,
      amount: transactionSplits.amount,
    })
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, id))
    .orderBy(asc(transactionSplits.sortOrder));

  const contas = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
      statementClosingDay: accounts.statementClosingDay,
      paymentDueDay: accounts.paymentDueDay,
    })
    .from(accounts)
    .where(and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        eq(accounts.isReimbursementPool, false),
      ))
    .orderBy(asc(accounts.name));

  const todas = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), isNull(categories.archivedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const pais = new Map(todas.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
  const opcoes = todas
    .map((c) => ({
      id: c.id,
      type: c.type,
      label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const inicial: LancamentoInicial = {
    id: tx.id,
    tipo: tx.type === "income" ? "income" : "expense",
    contaId: tx.accountId,
    valor: paraCampo(tx.amount),
    descricao: tx.description,
    data: tx.date,
    status: tx.status,
    // Um único rateio é o caso de categoria única; dois ou mais é rateio.
    rateado: splits.length > 1,
    splits: splits.map((s) => ({
      categoryId: s.categoryId ?? "",
      amount: paraCampo(s.amount),
    })),
    faturaVencimento: tx.settlementDate,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/lancamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Lançamentos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar lançamento
        </h1>
        {tx.status === "pending" && (
          <p className="text-sm text-muted-foreground">
            Este lançamento é previsto. Ajuste o valor real — é assim que uma
            conta fixa que varia (energia, água) recebe o valor do mês.
          </p>
        )}
      </div>

      <NewTransactionForm
        contas={contas}
        categorias={opcoes}
        baseCurrency={baseCurrency}
        hoje={inicial.data}
        inicial={inicial}
      />
    </div>
  );
}
