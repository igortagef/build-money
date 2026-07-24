import "server-only";
import { and, asc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bankBalanceChecks, bankStatementLines, transactions } from "@/db/schema";
import { monthRange } from "./queries";

/**
 * Demonstrativo diário de conciliação (modelo "dois níveis"):
 *
 *  - Por dia, compara o SALDO DO SISTEMA com o SALDO DO BANCO informado e mostra
 *    a diferença — os dias que não fecham saltam à vista.
 *  - Cada movimento traz o nível da conferência:
 *      vinculo   — conciliado por vínculo (casado com uma linha do extrato)
 *      saldo     — conferido por saldo (marcado manualmente, sem vínculo)
 *      pendente  — ainda não conferido
 *
 * O saldo do banco vem das conferências que o usuário informa (bankBalanceChecks)
 * — só há diferença nos dias em que um saldo foi informado.
 */

export type NivelMovimento = "vinculo" | "saldo" | "pendente";

export type MovimentoDemo = {
  id: string;
  description: string;
  amount: number;
  assinado: number;
  type: "income" | "expense" | "transfer";
  nivel: NivelMovimento;
};

export type DiaDemo = {
  data: string;
  movimentos: MovimentoDemo[];
  saldoSistema: number;
  saldoBanco: number | null;
  diferenca: number | null; // sistema − banco (quando o banco foi informado)
  fecha: boolean; // banco informado e diferença zero
  semVinculo: number; // movimentos ainda sem vínculo com o extrato
};

const sinal = (tipo: string, amount: number) => (tipo === "expense" ? -amount : amount);

export async function getDemonstrativo(ledgerId: string, accountId: string, referencia = new Date()) {
  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return null;

  const { start, end } = monthRange(referencia);

  // Saldo do sistema acumulado ANTES do mês (só realizado, não previsto).
  const [ant] = await db
    .select({
      total: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then -${transactions.amount} else ${transactions.amount} end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        ne(transactions.status, "pending"),
        lt(transactions.date, start),
      ),
    );

  const movs = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      status: transactions.status,
      date: transactions.date,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        ne(transactions.status, "pending"),
        gte(transactions.date, start),
        lte(transactions.date, end),
        sql`${transactions.supersededByPlanId} is null`,
      ),
    )
    .orderBy(asc(transactions.date), asc(transactions.createdAt));

  // Quais movimentos têm VÍNCULO com uma linha do extrato.
  const ids = movs.map((m) => m.id);
  const vinculados = new Set<string>();
  if (ids.length) {
    const linhas = await db
      .select({ transactionId: bankStatementLines.transactionId })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.accountId, accountId),
          eq(bankStatementLines.status, "conciliada"),
          inArray(bankStatementLines.transactionId, ids),
        ),
      );
    for (const l of linhas) if (l.transactionId) vinculados.add(l.transactionId);
  }

  // Saldos do banco informados no mês.
  const checks = await db
    .select({ date: bankBalanceChecks.date, balance: bankBalanceChecks.balance, criadoEm: bankBalanceChecks.createdAt })
    .from(bankBalanceChecks)
    .where(
      and(
        eq(bankBalanceChecks.accountId, accountId),
        gte(bankBalanceChecks.date, start),
        lte(bankBalanceChecks.date, end),
      ),
    )
    .orderBy(asc(bankBalanceChecks.date), asc(bankBalanceChecks.createdAt));
  // O mais recente por dia vale.
  const saldoBancoPorDia = new Map<string, number>();
  for (const c of checks) saldoBancoPorDia.set(c.date, c.balance);

  const porDia = new Map<string, typeof movs>();
  for (const m of movs) {
    const lista = porDia.get(m.date) ?? [];
    lista.push(m);
    porDia.set(m.date, lista);
  }

  let saldo = conta.openingBalance + (ant?.total ?? 0);
  const dias: DiaDemo[] = [];
  for (const [data, itens] of porDia) {
    const movimentos: MovimentoDemo[] = itens.map((m) => {
      const nivel: NivelMovimento =
        m.status === "reconciled" ? (vinculados.has(m.id) ? "vinculo" : "saldo") : "pendente";
      return {
        id: m.id,
        description: m.description,
        amount: m.amount,
        assinado: sinal(m.type, m.amount),
        type: m.type as MovimentoDemo["type"],
        nivel,
      };
    });
    saldo += movimentos.reduce((s, m) => s + m.assinado, 0);

    const saldoBanco = saldoBancoPorDia.has(data) ? saldoBancoPorDia.get(data)! : null;
    const diferenca = saldoBanco !== null ? saldo - saldoBanco : null;

    dias.push({
      data,
      movimentos,
      saldoSistema: saldo,
      saldoBanco,
      diferenca,
      fecha: saldoBanco !== null && diferenca === 0,
      semVinculo: movimentos.filter((m) => m.nivel !== "vinculo").length,
    });
  }

  const totalMov = movs.length;
  const totalVinculo = movs.filter((m) => vinculados.has(m.id)).length;
  const diasNaoFecham = dias.filter((d) => d.saldoBanco !== null && d.diferenca !== 0).length;

  return {
    conta,
    dias,
    totalMov,
    totalVinculo,
    semVinculo: totalMov - totalVinculo,
    diasNaoFecham,
    diasComSaldoBanco: dias.filter((d) => d.saldoBanco !== null).length,
  };
}
