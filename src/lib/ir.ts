import "server-only";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { getAssets } from "./assets";

/**
 * Relatório anual para o Imposto de Renda: rendimentos do ano, a posição de
 * "bens e direitos" e as "dívidas e ônus" em 31/12. É um AUXÍLIO para preencher
 * a declaração — não substitui informes oficiais. Contas têm saldo apurado em
 * 31/12; investimentos e bens usam o valor atual cadastrado (aproximação, já
 * que não guardamos foto histórica de cada bem).
 */
export type ItemPatrimonio = { nome: string; tipo: string; valor: number };

export async function getRelatorioIR(ledgerId: string, ano: number) {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  const [rendimentos, contasRaw, ativos] = await Promise.all([
    // Rendimentos recebidos no ano, por categoria.
    db
      .select({
        name: categories.name,
        total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
      })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          eq(transactions.type, "income"),
          ne(transactions.status, "pending"),
          gte(transactions.date, inicio),
          lte(transactions.date, fim),
        ),
      )
      .groupBy(categories.name)
      .orderBy(sql`sum(${transactionSplits.amountBase}) desc`),
    // Saldo de cada conta em 31/12 (movimentos realizados até a data).
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        openingBalance: accounts.openingBalance,
        mov: sql<number>`coalesce(sum(
          case
            when ${transactions.status} = 'pending' then 0
            when ${transactions.type} = 'expense' then -${transactions.amount}
            else ${transactions.amount}
          end
        ), 0)`.mapWith(Number),
      })
      .from(accounts)
      .leftJoin(
        transactions,
        and(eq(transactions.accountId, accounts.id), lte(transactions.date, fim)),
      )
      .where(and(eq(accounts.ledgerId, ledgerId), sql`${accounts.archivedAt} is null`))
      .groupBy(accounts.id),
    getAssets(ledgerId),
  ]);

  const bens: ItemPatrimonio[] = [];
  const dividas: ItemPatrimonio[] = [];

  for (const c of contasRaw) {
    const saldo = c.openingBalance + c.mov;
    if (c.type === "credit_card") {
      if (saldo < 0) dividas.push({ nome: `Cartão ${c.name}`, tipo: "Fatura de cartão", valor: -saldo });
    } else if (saldo > 0) {
      bens.push({ nome: c.name, tipo: "Saldo em conta", valor: saldo });
    } else if (saldo < 0) {
      dividas.push({ nome: c.name, tipo: "Conta no negativo", valor: -saldo });
    }
  }
  for (const a of ativos) {
    if (a.currentValue !== 0) bens.push({ nome: a.name, tipo: a.kindLabel, valor: a.currentValue });
  }

  bens.sort((a, b) => b.valor - a.valor);
  dividas.sort((a, b) => b.valor - a.valor);

  const totalRendimentos = rendimentos.reduce((s, r) => s + r.total, 0);
  const totalBens = bens.reduce((s, b) => s + b.valor, 0);
  const totalDividas = dividas.reduce((s, d) => s + d.valor, 0);

  return {
    ano,
    rendimentos,
    totalRendimentos,
    bens,
    totalBens,
    dividas,
    totalDividas,
    patrimonioLiquido: totalBens - totalDividas,
  };
}
