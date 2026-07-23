import { Repeat } from "lucide-react";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui";
import { ProvisionarReceitaForm } from "./form";
import { RemoverReceitaButton } from "./remover-button";

export const metadata = { title: "Receitas previstas · Build Money" };

export default async function ReceitasPrevistasPage() {
  const { ledgerId, baseCurrency } = await requireAccess();
  const hoje = new Date().toISOString().slice(0, 10);

  const contas = await db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), isNull(accounts.archivedAt), eq(accounts.isReimbursementPool, false)))
    .orderBy(asc(accounts.name));

  const catsReceita = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "income"), isNull(categories.archivedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const pais = new Map(catsReceita.filter((c) => !c.parentId).map((c) => [c.id, c.name]));
  const categoriasReceita = catsReceita
    .map((c) => ({ id: c.id, label: c.parentId ? `${pais.get(c.parentId) ?? ""} › ${c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  // Receitas previstas futuras: entradas ainda não realizadas, a partir de hoje.
  const previstas = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      currency: transactions.currency,
      date: transactions.date,
      accountName: accounts.name,
      recorrente: sql<boolean>`${transactions.recurringRuleId} is not null`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "income"),
        eq(transactions.status, "pending"),
        gte(transactions.date, hoje),
      ),
    )
    .orderBy(asc(transactions.date));

  const totalPrevisto = previstas.reduce((s, p) => s + p.amount, 0);
  const semContas = contas.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receitas previstas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provisione o que você espera receber — pontual (um freela, um bônus) ou
          fixo (salário, aluguel). Tudo entra no{" "}
          <a href="/relatorios/fluxo" className="underline">fluxo de caixa projetado</a>{" "}
          e você confirma quando o dinheiro cair.
        </p>
      </div>

      {semContas ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Cadastre uma conta antes de provisionar receitas.
        </Card>
      ) : (
        <ProvisionarReceitaForm
          contas={contas}
          categorias={categoriasReceita}
          baseCurrency={baseCurrency}
          hoje={hoje}
        />
      )}

      {/* Lista do que já está provisionado */}
      {previstas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">A receber</h2>
            <span className="tabular text-sm font-semibold text-income">
              {formatMoney(totalPrevisto, baseCurrency)}
            </span>
          </div>
          <Card className="divide-y divide-border">
            {previstas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {p.description}
                    {p.recorrente && (
                      <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="recorrente" />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {" · "}
                    {p.accountName}
                    {p.recorrente && " · fixa"}
                  </p>
                </div>
                <p className="tabular shrink-0 font-semibold text-income">
                  + {formatMoney(p.amount, p.currency)}
                </p>
                {/* Recorrente se gerencia em Contas fixas; só a avulsa some aqui. */}
                {!p.recorrente && <RemoverReceitaButton id={p.id} descricao={p.description} />}
              </div>
            ))}
          </Card>
          <p className="text-xs text-muted-foreground">
            As receitas fixas (recorrentes) são geridas em{" "}
            <a href="/contas-fixas" className="underline">Contas fixas</a>.
          </p>
        </section>
      )}
    </div>
  );
}
