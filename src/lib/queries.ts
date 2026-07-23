import "server-only";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import type { Regime } from "./statement";
import {
  accounts,
  categories,
  costCenters,
  transactions,
  transactionSplits,
  reimbursables,
} from "@/db/schema";

/**
 * Coluna de data usada nos relatórios, conforme o regime escolhido.
 *
 * competência -> transactions.date (quando o gasto aconteceu)
 * caixa       -> settlement_date (quando o dinheiro sai; no cartão, o
 *                vencimento da fatura). O coalesce cobre lançamentos antigos,
 *                gravados antes de a data de caixa existir.
 */
function colunaData(regime: Regime) {
  return regime === "caixa"
    ? sql`coalesce(${transactions.settlementDate}, ${transactions.date})`
    : sql`${transactions.date}`;
}

/** Primeiro e último dia do mês de uma data, em formato ISO. */
export function monthRange(reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  return {
    start: iso(new Date(year, month, 1)),
    end: iso(new Date(year, month + 1, 0)),
  };
}

/**
 * Saldo de cada conta: saldo inicial mais os lançamentos já realizados.
 * Lançamentos previstos ("pending") ficam de fora — eles pertencem ao fluxo
 * de caixa previsto, não ao saldo atual.
 */
export async function getAccountsWithBalance(ledgerId: string) {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      currency: accounts.currency,
      institution: accounts.institution,
      color: accounts.color,
      icon: accounts.icon,
      creditLimit: accounts.creditLimit,
      openingBalance: accounts.openingBalance,
      includeInNetWorth: accounts.includeInNetWorth,
      movements: sql<number>`coalesce(sum(
        case
          when ${transactions.status} = 'pending' then 0
          when ${transactions.type} = 'expense' then -${transactions.amount}
          else ${transactions.amount}
        end
      ), 0)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(and(eq(accounts.ledgerId, ledgerId), sql`${accounts.archivedAt} is null`))
    .groupBy(accounts.id)
    .orderBy(accounts.name);

  return rows.map((r) => ({
    ...r,
    balance: r.openingBalance + r.movements,
  }));
}

/**
 * Totais de receita e despesa do mês, na moeda base do espaço.
 * Transferências entre contas próprias não são receita nem despesa.
 */
export async function getMonthSummary(
  ledgerId: string,
  reference?: Date,
  regime: Regime = "competencia",
) {
  const { start, end } = monthRange(reference);
  const data = colunaData(regime);

  const [row] = await db
    .select({
      income: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'income' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
      expense: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        ne(transactions.status, "pending"),
        ne(transactions.type, "transfer"),
        gte(data, start),
        lte(data, end),
      ),
    );

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return { income, expense, balance: income - expense };
}

export async function getRecentTransactions(ledgerId: string, limit = 8) {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      date: transactions.date,
      status: transactions.status,
      accountName: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.ledgerId, ledgerId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}

/** Gasto por categoria no mês, agregado a partir dos rateios. */
export async function getExpensesByCategory(
  ledgerId: string,
  reference?: Date,
  limit = 8,
  regime: Regime = "competencia",
) {
  const { start, end } = monthRange(reference);
  const data = colunaData(regime);

  const rows = await db
    .select({
      name: categories.name,
      color: costCenters.color,
      total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
    })
    .from(transactionSplits)
    .innerJoin(
      transactions,
      eq(transactionSplits.transactionId, transactions.id),
    )
    .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .leftJoin(costCenters, eq(categories.costCenterId, costCenters.id))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "expense"),
        ne(transactions.status, "pending"),
        gte(data, start),
        lte(data, end),
      ),
    )
    .groupBy(categories.name, costCenters.color)
    .orderBy(desc(sql`sum(${transactionSplits.amountBase})`))
    .limit(limit);

  return rows;
}

/** Total por centro de custo no mês. */
export async function getExpensesByCostCenter(
  ledgerId: string,
  reference?: Date,
  regime: Regime = "competencia",
) {
  const { start, end } = monthRange(reference);
  const data = colunaData(regime);

  return db
    .select({
      name: sql<string>`coalesce(${costCenters.name}, 'Sem centro de custo')`,
      color: costCenters.color,
      total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
    })
    .from(transactionSplits)
    .innerJoin(
      transactions,
      eq(transactionSplits.transactionId, transactions.id),
    )
    .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
    // O centro de custo do rateio sobrescreve o herdado da categoria.
    .leftJoin(
      costCenters,
      eq(
        sql`coalesce(${transactionSplits.costCenterId}, ${categories.costCenterId})`,
        costCenters.id,
      ),
    )
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.type, "expense"),
        ne(transactions.status, "pending"),
        gte(data, start),
        lte(data, end),
      ),
    )
    .groupBy(costCenters.name, costCenters.color)
    .orderBy(desc(sql`sum(${transactionSplits.amountBase})`));
}

/** Receitas e despesas dos últimos N meses, para a evolução. */
export async function getMonthlyTrend(
  ledgerId: string,
  months = 6,
  regime: Regime = "competencia",
  reference?: Date,
) {
  const data = colunaData(regime);
  // A janela termina no mês de referência (por padrão, o atual) e recua N meses.
  const hoje = reference ?? new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (months - 1), 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  const rows = await db
    .select({
      mes: sql<string>`to_char(${data}, 'YYYY-MM')`,
      receitas: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'income' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
      despesas: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        ne(transactions.status, "pending"),
        ne(transactions.type, "transfer"),
        gte(data, iso(inicio)),
      ),
    )
    .groupBy(sql`to_char(${data}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${data}, 'YYYY-MM')`);

  // Meses sem lançamento não voltam do banco; o gráfico precisa deles para
  // que a linha do tempo não pule buracos.
  const mapa = new Map(rows.map((r) => [r.mes, r]));
  const saida: Array<{
    mes: string;
    rotulo: string;
    receitas: number;
    despesas: number;
    resultado: number;
    saldoAcumulado: number;
  }> = [];

  // O saldo acompanha mês a mês somando o resultado de cada um: é a linha que
  // mostra se, no conjunto, o dinheiro está subindo ou descendo.
  let acumulado = 0;
  for (let i = 0; i < months; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (months - 1) + i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const r = mapa.get(chave);
    const receitas = r?.receitas ?? 0;
    const despesas = r?.despesas ?? 0;
    const resultado = receitas - despesas;
    acumulado += resultado;
    saida.push({
      mes: chave,
      rotulo: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d),
      receitas,
      despesas,
      resultado,
      saldoAcumulado: acumulado,
    });
  }
  return saida;
}

/**
 * Lançamentos previstos que precisam de atenção: os vencidos (data já passou e
 * ninguém confirmou) e os que vencem nos próximos dias. É o que evita perder
 * um pagamento — o previsto vira cobrança se ninguém olha.
 */
export async function getVencimentos(ledgerId: string, diasFrente = 7) {
  const hoje = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const hojeStr = iso(hoje);
  const limite = iso(new Date(hoje.getTime() + diasFrente * 86_400_000));

  const linhas = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      date: transactions.date,
      accountName: accounts.name,
      // Categoria do rateio (a primeira), para o atalho já abrir filtrado.
      categoryId: sql<string | null>`(
        select ts.category_id from ${transactionSplits} ts
        where ts.transaction_id = ${transactions.id}
        order by ts.sort_order limit 1
      )`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "pending"),
        ne(transactions.type, "transfer"),
        // Parcelas reparceladas saíram do "a pagar" — quem paga são as novas.
        sql`${transactions.supersededByPlanId} is null`,
        lte(transactions.date, limite),
      ),
    )
    .orderBy(asc(transactions.date));

  const vencidas = linhas.filter((l) => l.date < hojeStr);
  const aVencer = linhas.filter((l) => l.date >= hojeStr);

  return {
    vencidas,
    aVencer,
    totalVencido: vencidas
      .filter((l) => l.type === "expense")
      .reduce((s, l) => s + l.amount, 0),
    totalAVencer: aVencer
      .filter((l) => l.type === "expense")
      .reduce((s, l) => s + l.amount, 0),
  };
}

/**
 * Relatório agregado de um intervalo arbitrário: totais, evolução mês a mês,
 * despesas por categoria e por centro de custo. Alimenta a tela de relatórios,
 * onde o usuário escolhe o período (o painel usa janelas fixas).
 */
export async function getRelatorioPeriodo(
  ledgerId: string,
  start: string,
  end: string,
  regime: Regime = "competencia",
) {
  const data = colunaData(regime);

  const porMes = await db
    .select({
      mes: sql<string>`to_char(${data}, 'YYYY-MM')`,
      receitas: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'income' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
      despesas: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then ${transactions.amountBase} else 0 end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        ne(transactions.status, "pending"),
        ne(transactions.type, "transfer"),
        gte(data, start),
        lte(data, end),
      ),
    )
    .groupBy(sql`to_char(${data}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${data}, 'YYYY-MM')`);

  const [porCategoria, porCentro] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        color: costCenters.color,
        total: sql<number>`sum(${transactionSplits.amountBase})`.mapWith(Number),
      })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
      .leftJoin(costCenters, eq(categories.costCenterId, costCenters.id))
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          eq(transactions.type, "expense"),
          ne(transactions.status, "pending"),
          gte(data, start),
          lte(data, end),
        ),
      )
      .groupBy(categories.id, categories.name, costCenters.color)
      .orderBy(desc(sql`sum(${transactionSplits.amountBase})`)),
    db
      .select({
        id: costCenters.id,
        name: sql<string>`coalesce(${costCenters.name}, 'Sem centro de custo')`,
        color: costCenters.color,
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
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          eq(transactions.type, "expense"),
          ne(transactions.status, "pending"),
          gte(data, start),
          lte(data, end),
        ),
      )
      .groupBy(costCenters.id, costCenters.name, costCenters.color)
      .orderBy(desc(sql`sum(${transactionSplits.amountBase})`)),
  ]);

  const receitas = porMes.reduce((s, m) => s + m.receitas, 0);
  const despesas = porMes.reduce((s, m) => s + m.despesas, 0);

  return {
    porMes: porMes.map((m) => ({
      ...m,
      rotulo: new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      }).format(new Date(`${m.mes}-01T12:00:00`)),
      resultado: m.receitas - m.despesas,
    })),
    porCategoria,
    porCentro,
    totais: { receitas, despesas, resultado: receitas - despesas },
  };
}

/**
 * Lista plana de lançamentos do período para exportação em CSV. Uma linha por
 * lançamento, com as categorias do rateio agregadas num campo só.
 */
export async function getTransacoesParaExport(
  ledgerId: string,
  start: string,
  end: string,
  regime: Regime = "competencia",
) {
  const data = colunaData(regime);

  return db
    .select({
      date: transactions.date,
      settlementDate: transactions.settlementDate,
      description: transactions.description,
      type: transactions.type,
      status: transactions.status,
      amount: transactions.amount,
      amountBase: transactions.amountBase,
      currency: transactions.currency,
      accountName: accounts.name,
      categorias: sql<string[]>`coalesce(
        array_agg(${categories.name} order by ${transactionSplits.sortOrder})
          filter (where ${categories.name} is not null),
        '{}'
      )`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(transactionSplits, eq(transactionSplits.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        gte(data, start),
        lte(data, end),
      ),
    )
    .groupBy(transactions.id, accounts.name)
    .orderBy(sql`${data} asc`, desc(transactions.createdAt));
}

/** Resumo de rachas em aberto: total a receber e quantos ainda faltam. */
export async function getResumoRachas(ledgerId: string) {
  const linhas = await db
    .select({
      amount: reimbursables.amount,
      settledAmount: reimbursables.settledAmount,
    })
    .from(reimbursables)
    .where(
      and(eq(reimbursables.ledgerId, ledgerId), eq(reimbursables.status, "open")),
    );

  return {
    aReceber: linhas.reduce((s, r) => s + (r.amount - r.settledAmount), 0),
    emAberto: linhas.length,
  };
}
