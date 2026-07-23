import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { monthRange } from "./queries";

/**
 * Extrato de uma conta para conferência (conciliação com o banco/fatura).
 *
 * Mostra tudo que foi lançado no mês, com saldo corrido lançamento a lançamento,
 * e o quanto ainda falta conferir. O objetivo é bater o app contra o extrato do
 * banco (ou a fatura do cartão): quando tudo está conferido, o "saldo conferido"
 * tem de igualar o saldo do extrato.
 */

const sinal = (tipo: string, amount: number) =>
  tipo === "expense" ? -amount : amount; // income e transferência já vêm com sinal certo

export type MovimentoExtrato = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  status: "pending" | "cleared" | "reconciled";
  date: string;
  categorias: string[];
  assinado: number; // impacto no saldo (0 se previsto)
  saldoCorrido: number; // saldo realizado após este lançamento
};

export async function getExtratoConta(
  ledgerId: string,
  accountId: string,
  referencia = new Date(),
) {
  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return null;

  const { start, end } = monthRange(referencia);

  // Saldo realizado até o início do mês (base do saldo corrido).
  const [ant] = await db
    .select({
      s: sql<number>`coalesce(sum(
        case
          when ${transactions.status} = 'pending' then 0
          when ${transactions.type} = 'expense' then -${transactions.amount}
          else ${transactions.amount}
        end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        lt(transactions.date, start),
      ),
    );
  const saldoInicial = conta.openingBalance + (ant?.s ?? 0);

  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      status: transactions.status,
      date: transactions.date,
      categorias: sql<string[]>`coalesce(
        array_agg(${categories.name} order by ${transactionSplits.sortOrder})
          filter (where ${categories.name} is not null),
        '{}'
      )`,
    })
    .from(transactions)
    .leftJoin(transactionSplits, eq(transactionSplits.transactionId, transactions.id))
    .leftJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        gte(transactions.date, start),
        lte(transactions.date, end),
        // Reparceladas ficam só no histórico da fatura, fora do extrato.
        sql`${transactions.supersededByPlanId} is null`,
      ),
    )
    .groupBy(transactions.id)
    .orderBy(asc(transactions.date), asc(transactions.createdAt));

  let saldo = saldoInicial;
  const movimentos: MovimentoExtrato[] = rows.map((r) => {
    const assinado = r.status === "pending" ? 0 : sinal(r.type, r.amount);
    saldo += assinado;
    return {
      id: r.id,
      description: r.description,
      amount: r.amount,
      type: r.type,
      status: r.status,
      date: r.date,
      categorias: r.categorias ?? [],
      assinado,
      saldoCorrido: saldo,
    };
  });

  const realizados = movimentos.filter((m) => m.status !== "pending");
  const entradas = realizados.filter((m) => m.type === "income").reduce((s, m) => s + m.amount, 0);
  const saidas = realizados.filter((m) => m.type === "expense").reduce((s, m) => s + m.amount, 0);
  const aConferir = realizados.filter((m) => m.status === "cleared");
  const conferidos = realizados.filter((m) => m.status === "reconciled").length;

  return {
    conta,
    saldoInicial,
    saldoFinal: saldo,
    movimentos,
    entradas,
    saidas,
    conferidos,
    qtdAConferir: aConferir.length,
    qtdRealizados: realizados.length,
    // O quanto ainda não foi batido com o extrato (soma dos não conferidos).
    faltaConferir: aConferir.reduce((s, m) => s + m.assinado, 0),
  };
}

/** Contas do espaço para o seletor do extrato (não arquivadas). */
export async function getContasParaExtrato(ledgerId: string) {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), sql`${accounts.archivedAt} is null`))
    .orderBy(desc(accounts.createdAt));
}
