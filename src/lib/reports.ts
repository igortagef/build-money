import "server-only";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  costCenters,
  transactions,
  transactionSplits,
} from "@/db/schema";
import type { Regime } from "./statement";
import { getAccountsWithBalance } from "./queries";
import { getResumoPatrimonio } from "./assets";

/** Coluna de data conforme o regime — igual à de queries.ts. */
function colunaData(regime: Regime) {
  return regime === "caixa"
    ? sql`coalesce(${transactions.settlementDate}, ${transactions.date})`
    : sql`${transactions.date}`;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * DRE: demonstração de resultado do período.
 *
 * Receitas por categoria, despesas por centro de custo (o "grupo" que agrega
 * várias categorias), e o resultado — superávit ou déficit. É o retrato de
 * quanto entrou, quanto saiu e o que sobrou.
 */
export async function getDRE(
  ledgerId: string,
  start: string,
  end: string,
  regime: Regime = "competencia",
) {
  const data = colunaData(regime);

  const filtroBase = and(
    eq(transactions.ledgerId, ledgerId),
    ne(transactions.status, "pending"),
    gte(data, start),
    lte(data, end),
  );

  // Receitas por categoria (nome do rateio).
  const receitas = await db
    .select({
      id: categories.id,
      name: categories.name,
      total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(and(filtroBase, eq(transactions.type, "income")))
    .groupBy(categories.id, categories.name)
    .orderBy(sql`sum(${transactionSplits.amountBase}) desc`);

  // Despesas agrupadas por centro de custo (o "grupo" da DRE).
  const despesas = await db
    .select({
      id: costCenters.id,
      name: sql<string>`coalesce(${costCenters.name}, 'Sem centro de custo')`,
      total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .leftJoin(
      costCenters,
      eq(
        sql`coalesce(${transactionSplits.costCenterId}, ${categories.costCenterId})`,
        costCenters.id,
      ),
    )
    .where(and(filtroBase, eq(transactions.type, "expense")))
    .groupBy(costCenters.id, costCenters.name)
    .orderBy(sql`sum(${transactionSplits.amountBase}) desc`);

  // Também o total de receita/despesa direto das transações — cobre lançamentos
  // sem rateio, que não aparecem nas somas por categoria acima.
  const [tot] = await db
    .select({
      receita: sql<number>`coalesce(sum(case when ${transactions.type}='income' then ${transactions.amountBase} else 0 end),0)`.mapWith(Number),
      despesa: sql<number>`coalesce(sum(case when ${transactions.type}='expense' then ${transactions.amountBase} else 0 end),0)`.mapWith(Number),
    })
    .from(transactions)
    .where(and(filtroBase, ne(transactions.type, "transfer")));

  const totalReceitas = tot?.receita ?? 0;
  const totalDespesas = tot?.despesa ?? 0;
  const resultado = totalReceitas - totalDespesas;

  return {
    receitas,
    despesas,
    totalReceitas,
    totalDespesas,
    resultado,
    // Margem: quanto do que entrou sobrou. Sem receita, não há margem.
    margem: totalReceitas > 0 ? Math.round((resultado / totalReceitas) * 1000) / 10 : null,
    // Diferença coberta por lançamentos sem categoria (para uma nota de rodapé).
    receitaSemCategoria: totalReceitas - receitas.reduce((s, r) => s + r.total, 0),
    despesaSemCategoria: totalDespesas - despesas.reduce((s, d) => s + d.total, 0),
  };
}

/**
 * Balanço patrimonial pessoal: ativos − passivos = patrimônio líquido.
 *
 * Ativos: dinheiro em contas (saldo positivo) + investimentos + bens.
 * Passivos: saldos devedores (cartão de crédito com fatura em aberto, conta no
 * negativo). O saldo do cartão é naturalmente negativo aqui — as compras
 * reduzem o saldo —, então um saldo negativo é dívida.
 */
export async function getBalanco(ledgerId: string) {
  const [contas, patrimonio] = await Promise.all([
    getAccountsWithBalance(ledgerId),
    getResumoPatrimonio(ledgerId),
  ]);

  const contasAtivas = contas.filter((c) => c.balance >= 0);
  const contasPassivas = contas.filter((c) => c.balance < 0);

  const caixa = contasAtivas.reduce((s, c) => s + c.balance, 0);
  const dividas = contasPassivas.reduce((s, c) => s + Math.abs(c.balance), 0);

  const ativos = caixa + patrimonio.valorInvestimentos + patrimonio.valorBens;
  const passivos = dividas;

  return {
    // Linhas de ativo.
    caixa,
    investimentos: patrimonio.valorInvestimentos,
    bens: patrimonio.valorBens,
    totalAtivos: ativos,
    // Detalhe das contas, para listar cada uma.
    contasAtivas: contasAtivas.map((c) => ({ name: c.name, valor: c.balance })),
    contasPassivas: contasPassivas.map((c) => ({ name: c.name, valor: Math.abs(c.balance) })),
    // Passivos e resultado.
    dividas,
    totalPassivos: passivos,
    patrimonioLiquido: ativos - passivos,
  };
}

/**
 * Fluxo de caixa projetado: parte do saldo de hoje e projeta mês a mês somando
 * o que está previsto (contas fixas, parcelas, receitas provisionadas). Mostra
 * se e quando o caixa aperta.
 *
 * Usa a data de CAIXA (settlement): é quando o dinheiro realmente entra ou sai.
 * O cartão pesa no vencimento da fatura, não na compra.
 */
export async function getFluxoProjetado(ledgerId: string, meses = 6) {
  const contas = await getAccountsWithBalance(ledgerId);

  // Saldo de caixa de hoje: só contas de dinheiro (cartão não é caixa; é o meio
  // de uma dívida que aparece como saída no vencimento).
  const saldoInicial = contas
    .filter((c) => c.type !== "credit_card")
    .reduce((s, c) => s + c.balance, 0);

  const hoje = new Date();
  const inicio = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const dataCaixa = sql`coalesce(${transactions.settlementDate}, ${transactions.date})`;

  // Previstos futuros por mês de caixa.
  const linhas = await db
    .select({
      mes: sql<string>`to_char(${dataCaixa}, 'YYYY-MM')`,
      entradas: sql<number>`coalesce(sum(case when ${transactions.type}='income' then ${transactions.amountBase} else 0 end),0)`.mapWith(Number),
      saidas: sql<number>`coalesce(sum(case when ${transactions.type}='expense' then ${transactions.amountBase} else 0 end),0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "pending"),
        ne(transactions.type, "transfer"),
        // Parcelas reparceladas saíram do fluxo — quem entra são as novas.
        sql`${transactions.supersededByPlanId} is null`,
        gte(dataCaixa, inicio),
      ),
    )
    .groupBy(sql`to_char(${dataCaixa}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${dataCaixa}, 'YYYY-MM')`);

  const mapa = new Map(linhas.map((l) => [l.mes, l]));

  // Constrói a série contígua, acumulando sobre o saldo inicial.
  const rotuloMes = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
  const saida: Array<{
    mes: string;
    rotulo: string;
    entradas: number;
    saidas: number;
    resultado: number;
    saldoProjetado: number;
  }> = [];

  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const l = mapa.get(chave);
    const entradas = l?.entradas ?? 0;
    const saidas = l?.saidas ?? 0;
    const resultado = entradas - saidas;
    // Saldo projetado sobre o saldo inicial + a soma dos resultados até aqui.
    const anterior = i === 0 ? saldoInicial : saida[i - 1].saldoProjetado;
    saida.push({
      mes: chave,
      rotulo: rotuloMes.format(d),
      entradas,
      saidas,
      resultado,
      saldoProjetado: anterior + resultado,
    });
  }

  const menorSaldo = saida.reduce(
    (min, m) => (m.saldoProjetado < min.saldoProjetado ? m : min),
    saida[0],
  );

  return {
    saldoInicial,
    meses: saida,
    // Alerta de aperto: primeiro mês em que o caixa fica negativo, se houver.
    mesNegativo: saida.find((m) => m.saldoProjetado < 0) ?? null,
    menorSaldo,
  };
}
