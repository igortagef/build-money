import "server-only";
import { and, asc, eq, gte, lte, ne, sql, isNull, lt, desc } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, transactions, transactionSplits } from "@/db/schema";
import { monthRange } from "./queries";
import type { Regime } from "./statement";

/**
 * Orçamento mensal por categoria.
 *
 * `rollsOver` faz o valor definido em um mês valer para os meses seguintes
 * até ser alterado — sem isso o usuário teria que redigitar tudo todo mês, e
 * na prática abandonaria o orçamento no segundo mês.
 *
 * O gasto é medido a partir dos rateios, como todo relatório do app: um
 * lançamento de R$ 300 dividido em R$ 200 de Supermercado e R$ 100 de
 * Cosméticos consome R$ 200 do orçamento de Supermercado, não R$ 300.
 */

export const NIVEL_ALERTA = 80; // % a partir de onde o orçamento vira aviso

/** Primeiro dia do mês, em ISO — a chave usada na tabela de orçamentos. */
export function mesRef(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Orçamento vigente de cada categoria no mês.
 * Se o mês não tem valor próprio, herda o último definido com `rollsOver`.
 */
async function orcamentosVigentes(ledgerId: string, mes: string) {
  const linhas = await db
    .select({
      categoryId: budgets.categoryId,
      amount: budgets.amount,
      month: budgets.month,
      rollsOver: budgets.rollsOver,
    })
    .from(budgets)
    .where(and(eq(budgets.ledgerId, ledgerId), lte(budgets.month, mes)))
    .orderBy(asc(budgets.categoryId), desc(budgets.month));

  // A consulta vem ordenada por mês decrescente, então o primeiro registro de
  // cada categoria é o mais recente que vale para este mês.
  const vigente = new Map<string, { amount: number; herdado: boolean }>();
  for (const l of linhas) {
    if (!l.categoryId || vigente.has(l.categoryId)) continue;
    // Um valor de mês anterior só vale se foi marcado para repetir.
    if (l.month !== mes && !l.rollsOver) continue;
    vigente.set(l.categoryId, { amount: l.amount, herdado: l.month !== mes });
  }
  return vigente;
}

export async function getOrcamentoDoMes(
  ledgerId: string,
  referencia = new Date(),
  regime: Regime = "competencia",
) {
  const mes = mesRef(referencia);
  const { start, end } = monthRange(referencia);
  const dataCol =
    regime === "caixa"
      ? sql`coalesce(${transactions.settlementDate}, ${transactions.date})`
      : sql`${transactions.date}`;

  const vigente = await orcamentosVigentes(ledgerId, mes);

  // Gasto por categoria, a partir dos rateios.
  const gastos = await db
    .select({
      categoryId: transactionSplits.categoryId,
      gasto: sql<number>`coalesce(sum(${transactionSplits.amountBase}), 0)`.mapWith(
        Number,
      ),
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "expense"),
        ne(transactions.status, "pending"),
        gte(dataCol, start),
        lte(dataCol, end),
      ),
    )
    .groupBy(transactionSplits.categoryId);

  const gastoPorCat = new Map(
    gastos.filter((g) => g.categoryId).map((g) => [g.categoryId!, g.gasto]),
  );

  // Só categorias de despesa entram no orçamento — orçar receita não faz sentido.
  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      icon: categories.icon,
    })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, "expense"),
        isNull(categories.archivedAt),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const nomePai = new Map(
    cats.filter((c) => !c.parentId).map((c) => [c.id, c.name]),
  );

  const itens = cats.map((c) => {
    const orc = vigente.get(c.id);
    const gasto = gastoPorCat.get(c.id) ?? 0;
    const orcado = orc?.amount ?? 0;
    const restante = orcado - gasto;
    const percentual = orcado > 0 ? Math.round((gasto / orcado) * 100) : 0;

    return {
      categoryId: c.id,
      nome: c.name,
      caminho: c.parentId
        ? `${nomePai.get(c.parentId) ?? ""} › ${c.name}`
        : c.name,
      ehGrupo: !c.parentId,
      orcado,
      herdado: orc?.herdado ?? false,
      gasto,
      restante,
      percentual,
      estourou: orcado > 0 && gasto > orcado,
      perto: orcado > 0 && percentual >= NIVEL_ALERTA && gasto <= orcado,
    };
  });

  const comOrcamento = itens.filter((i) => i.orcado > 0);
  const totalOrcado = comOrcamento.reduce((s, i) => s + i.orcado, 0);
  const totalGasto = comOrcamento.reduce((s, i) => s + i.gasto, 0);

  // Despesa fora de qualquer categoria orçada: o orçamento não a enxerga,
  // e esconder isso daria uma falsa sensação de controle.
  const orcadas = new Set(comOrcamento.map((i) => i.categoryId));
  const gastoForaDoOrcamento = [...gastoPorCat.entries()]
    .filter(([id]) => !orcadas.has(id))
    .reduce((s, [, v]) => s + v, 0);

  return {
    mes,
    itens,
    comOrcamento,
    semOrcamento: itens.filter((i) => i.orcado === 0),
    totalOrcado,
    totalGasto,
    totalRestante: totalOrcado - totalGasto,
    percentualTotal:
      totalOrcado > 0 ? Math.round((totalGasto / totalOrcado) * 100) : 0,
    gastoForaDoOrcamento,
    estourouAlguma: comOrcamento.some((i) => i.estourou),
  };
}
