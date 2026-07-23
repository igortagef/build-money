import "server-only";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { monthRange } from "./queries";

/**
 * Dados extras do painel pedidos na revisão: comparativo do patrimônio,
 * lançamentos a conferir e a variação de gastos contra o mês anterior.
 */

/** Saldo somado das contas que entram no patrimônio, numa data de corte. */
async function saldoContasAte(ledgerId: string, dataCorte: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${accounts.openingBalance}), 0)`.mapWith(Number),
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
      and(eq(transactions.accountId, accounts.id), lte(transactions.date, dataCorte)),
    )
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        eq(accounts.includeInNetWorth, true),
        sql`${accounts.archivedAt} is null`,
      ),
    );
  return (row?.total ?? 0) + (row?.mov ?? 0);
}

/**
 * Comparativo do patrimônio: quanto ele variou desde o fim do mês anterior.
 * As contas são apuradas na data; investimentos e bens usam o valor atual (não
 * guardamos foto histórica de cada bem), então a variação reflete o caixa.
 */
export async function getComparativoPatrimonio(ledgerId: string, referencia = new Date()) {
  const { start } = monthRange(referencia);
  // Último dia do mês anterior = dia anterior ao início do mês de referência.
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const fimMesAnterior = d.toISOString().slice(0, 10);

  const [agora, antes] = await Promise.all([
    saldoContasAte(ledgerId, new Date().toISOString().slice(0, 10)),
    saldoContasAte(ledgerId, fimMesAnterior),
  ]);

  const variacao = agora - antes;
  const percentual = antes !== 0 ? Math.round((variacao / Math.abs(antes)) * 1000) / 10 : null;
  return { agora, antes, variacao, percentual };
}

/** Lançamentos realizados que ainda não foram conferidos com o extrato. */
export async function getAConferir(ledgerId: string) {
  const [row] = await db
    .select({
      qtd: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "cleared"),
        ne(transactions.type, "transfer"),
        sql`${transactions.supersededByPlanId} is null`,
      ),
    );

  // A conta com mais pendências, para o atalho levar direto ao extrato certo.
  const [conta] = await db
    .select({ id: accounts.id, nome: accounts.name, qtd: sql<number>`count(*)`.mapWith(Number) })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "cleared"),
        ne(transactions.type, "transfer"),
      ),
    )
    .groupBy(accounts.id, accounts.name)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  return {
    qtd: row?.qtd ?? 0,
    total: row?.total ?? 0,
    contaId: conta?.id ?? null,
    contaNome: conta?.nome ?? null,
  };
}

export type VariacaoCategoria = {
  nome: string;
  atual: number;
  anterior: number;
  variacao: number;
  percentual: number | null;
};

/**
 * Variação de gastos por categoria entre o mês de referência e o anterior —
 * o "gastou 22% a mais em Mercado". Ordena pelo maior salto absoluto.
 */
export async function getComparativoMensal(
  ledgerId: string,
  referencia = new Date(),
  limite = 5,
): Promise<VariacaoCategoria[]> {
  const atual = monthRange(referencia);
  const anteriorRef = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  const anterior = monthRange(anteriorRef);

  const gastos = async (start: string, end: string) =>
    db
      .select({
        nome: categories.name,
        total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
      })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .innerJoin(categories, eq(categories.id, transactionSplits.categoryId))
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          eq(transactions.type, "expense"),
          ne(transactions.status, "pending"),
          gte(transactions.date, start),
          lte(transactions.date, end),
        ),
      )
      .groupBy(categories.name);

  const [linhasAtual, linhasAnterior] = await Promise.all([
    gastos(atual.start, atual.end),
    gastos(anterior.start, anterior.end),
  ]);

  const mapaAnterior = new Map(linhasAnterior.map((l) => [l.nome, l.total]));
  const nomes = new Set([...linhasAtual.map((l) => l.nome), ...mapaAnterior.keys()]);

  const saida: VariacaoCategoria[] = [];
  for (const nome of nomes) {
    const a = linhasAtual.find((l) => l.nome === nome)?.total ?? 0;
    const b = mapaAnterior.get(nome) ?? 0;
    if (a === 0 && b === 0) continue;
    saida.push({
      nome,
      atual: a,
      anterior: b,
      variacao: a - b,
      percentual: b !== 0 ? Math.round(((a - b) / b) * 1000) / 10 : null,
    });
  }

  // Maior mudança primeiro (para cima ou para baixo).
  saida.sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao));
  return saida.slice(0, limite);
}
