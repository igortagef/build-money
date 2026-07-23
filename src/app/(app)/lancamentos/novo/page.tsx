import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { LancamentoTabs } from "./tabs";

export const metadata = { title: "Novo lançamento · Build Money" };

export default async function NovoLancamentoPage(props: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await props.searchParams;
  const { ledgerId, baseCurrency } = await requireAccess();

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
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        isNull(accounts.archivedAt),
        eq(accounts.isReimbursementPool, false),
      ),
    )
    .orderBy(asc(accounts.name));

  // Sem conta não há onde lançar; mandar para o cadastro é mais útil que
  // mostrar um formulário quebrado.
  if (contas.length === 0) redirect("/contas/nova");

  const todas = await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), isNull(categories.archivedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const pais = new Map(todas.filter((c) => !c.parentId).map((c) => [c.id, c.name]));

  // Subcategoria aparece como "Moradia › Aluguel", para o usuário achar sem
  // precisar navegar por níveis dentro de um <select>.
  const opcoes = todas
    .map((c) => ({
      id: c.id,
      type: c.type,
      label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const categoriasDespesa = opcoes.filter((c) => c.type === "expense");

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
        <h1 className="text-2xl font-semibold tracking-tight">Novo lançamento</h1>
      </div>

      <LancamentoTabs
        abaInicial={aba}
        contas={contas}
        categorias={opcoes}
        categoriasDespesa={categoriasDespesa}
        baseCurrency={baseCurrency}
        hoje={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
