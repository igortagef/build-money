import "server-only";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bankBalanceChecks, transactions } from "@/db/schema";

/**
 * Conferência do saldo contra o banco.
 *
 * O app calcula "saldo lançado" e "saldo conferido", mas até aqui nunca sabíamos
 * o que o BANCO diz. Este módulo captura esse número — "no dia D o extrato fecha
 * em R$ X" — e mostra a diferença contra o saldo do app na mesma data. Zero é o
 * objetivo: livros do app iguais ao extrato até aquele dia.
 */

/**
 * Saldo do app na conta ATÉ o fim de uma data (inclusive), contando só o que é
 * realizado (não `pending`). É o número que se compara com o extrato: o previsto
 * ainda não passou pelo banco.
 */
export async function saldoDoAppAte(
  ledgerId: string,
  accountId: string,
  data: string,
): Promise<number | null> {
  const [conta] = await db
    .select({ openingBalance: accounts.openingBalance })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return null;

  const [mov] = await db
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
        sql`${transactions.status} <> 'pending'`,
        lte(transactions.date, data),
      ),
    );

  return conta.openingBalance + (mov?.total ?? 0);
}

export type SaldoBancoConferido = {
  date: string;
  balance: number;
  saldoApp: number;
  diferenca: number; // saldoApp - balance; zero = bate
  criadoEm: Date;
};

/** A conferência de saldo mais recente da conta, já com a diferença calculada. */
export async function getUltimaConferenciaSaldo(
  ledgerId: string,
  accountId: string,
): Promise<SaldoBancoConferido | null> {
  const [check] = await db
    .select()
    .from(bankBalanceChecks)
    .where(
      and(
        eq(bankBalanceChecks.ledgerId, ledgerId),
        eq(bankBalanceChecks.accountId, accountId),
      ),
    )
    .orderBy(desc(bankBalanceChecks.date), desc(bankBalanceChecks.createdAt))
    .limit(1);
  if (!check) return null;

  const saldoApp = (await saldoDoAppAte(ledgerId, accountId, check.date)) ?? 0;
  return {
    date: check.date,
    balance: check.balance,
    saldoApp,
    diferenca: saldoApp - check.balance,
    criadoEm: check.createdAt,
  };
}

/** Registra (ou reafirma) o saldo que o banco mostra numa data. */
export async function registrarSaldoBanco(
  ledgerId: string,
  accountId: string,
  data: string,
  balance: number,
): Promise<{ ok: boolean; erro?: string }> {
  const [conta] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return { ok: false, erro: "Conta inválida." };

  await db.insert(bankBalanceChecks).values({ ledgerId, accountId, date: data, balance });
  return { ok: true };
}
