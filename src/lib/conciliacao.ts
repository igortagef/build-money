import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bankStatementLines, transactions } from "@/db/schema";
import type { AccountType, CurrencyCode } from "@/db/schema";

/**
 * Visão geral da conciliação, conta a conta: até onde está conferido, quanto
 * falta e se há linhas de extrato esperando.
 *
 * A "linha de corte" (conferidoAte) é o dia até o qual TUDO está conferido — o
 * dia anterior ao primeiro lançamento realizado que ainda não foi batido. É o
 * número honesto: só avança quando o dia inteiro fecha, então dá para comparar
 * direto com o saldo do extrato naquela data.
 */
export type ResumoConciliacao = {
  id: string;
  nome: string;
  tipo: AccountType;
  currency: CurrencyCode;
  bankId: string | null;
  conferidoAte: string | null;
  saldoConferido: number;
  aConferir: number;
  valorAConferir: number;
  linhasPendentes: number;
  emDia: boolean;
};

export async function getResumoConciliacao(ledgerId: string): Promise<ResumoConciliacao[]> {
  const contas = await db
    .select({
      id: accounts.id,
      nome: accounts.name,
      tipo: accounts.type,
      currency: accounts.currency,
      bankId: accounts.icon,
      openingBalance: accounts.openingBalance,
    })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), sql`${accounts.archivedAt} is null`))
    .orderBy(accounts.name);

  if (contas.length === 0) return [];

  // Um passe só: por conta, o primeiro não-conferido, quantos faltam e o valor.
  const agg = await db
    .select({
      accountId: transactions.accountId,
      pendentes: sql<number>`count(*) filter (where ${transactions.status} = 'cleared')`.mapWith(Number),
      valor: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.status} = 'cleared'), 0)`.mapWith(Number),
      primeiroPendente: sql<string | null>`min(${transactions.date}) filter (where ${transactions.status} = 'cleared')`,
      ultimo: sql<string | null>`max(${transactions.date})`,
      // Saldo já conferido: movimentos conciliados (o previsto não entra).
      movConferido: sql<number>`coalesce(sum(
        case when ${transactions.status} = 'reconciled'
          then case when ${transactions.type} = 'expense' then -${transactions.amount} else ${transactions.amount} end
          else 0 end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(and(eq(transactions.ledgerId, ledgerId), ne(transactions.status, "pending")))
    .groupBy(transactions.accountId);
  const porConta = new Map(agg.map((a) => [a.accountId, a]));

  // Linhas de extrato ainda esperando conciliação.
  const linhas = await db
    .select({
      accountId: bankStatementLines.accountId,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.ledgerId, ledgerId),
        eq(bankStatementLines.status, "pendente"),
      ),
    )
    .groupBy(bankStatementLines.accountId);
  const linhasPorConta = new Map(linhas.map((l) => [l.accountId, l.n]));

  const diaAnterior = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  return contas.map((c) => {
    const a = porConta.get(c.id);
    const pendentes = a?.pendentes ?? 0;
    // Tudo conferido -> a linha de corte é o último lançamento da conta.
    const conferidoAte = a?.primeiroPendente
      ? diaAnterior(a.primeiroPendente)
      : (a?.ultimo ?? null);

    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      currency: c.currency,
      bankId: c.bankId,
      conferidoAte,
      saldoConferido: c.openingBalance + (a?.movConferido ?? 0),
      aConferir: pendentes,
      valorAConferir: a?.valor ?? 0,
      linhasPendentes: linhasPorConta.get(c.id) ?? 0,
      emDia: pendentes === 0,
    };
  });
}
