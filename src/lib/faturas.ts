import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  categories,
  creditCardStatements,
  installmentPlans,
  transactions,
  transactionSplits,
} from "@/db/schema";
import type { CurrencyCode, TransactionStatus } from "@/db/schema";
import {
  calcularDataDeCaixa,
  dataDeFechamentoDaFatura,
  dataDePagamentoDaFatura,
  periodoDaFatura,
} from "./statement";

/**
 * Faturas de cartão de crédito.
 *
 * Uma fatura é o conjunto de compras de um ciclo, identificado pela data de
 * VENCIMENTO (que é a data de caixa das compras — `settlement_date`). Antes de
 * fechar, a fatura é calculada; ao fechar (manual ou na data), vira uma linha
 * em `credit_card_statements` com o total congelado. Cada movimento carrega sua
 * origem (parcela "3/12", reparcelamento) para que tudo seja rastreável.
 */

const hojeISO = () => new Date().toISOString().slice(0, 10);

export type StatusFatura = "open" | "closed" | "paid" | "reparcelada";

export type MovimentoFatura = {
  id: string;
  date: string;
  description: string;
  categorias: string[];
  amount: number; // centavos, sempre positivo; o sinal vem de `type`
  type: "income" | "expense";
  status: TransactionStatus;
  installmentNumber: number | null;
  installmentTotal: number | null;
  ehReparcelamento: boolean; // parcela nascida de um reparcelamento
  origemVencimento: string | null; // se reparcelamento, o vencimento da fatura de origem
  reparcelada: boolean; // parcela substituída por um reparcelamento (histórico)
};

export type Fatura = {
  dueDate: string;
  closingDate: string;
  periodo: { inicio: string; fim: string };
  status: StatusFatura;
  persistida: boolean;
  statementId: string | null;
  total: number; // a pagar, líquido (compras − estornos), sem as reparceladas
  qtdMovimentos: number;
  movimentos: MovimentoFatura[];
};

type ContaCartao = {
  id: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

/** Fatura em que uma compra cai, a partir da sua data de caixa (ou competência). */
function chaveFatura(settlementDate: string | null, date: string, conta: ContaCartao): string {
  if (settlementDate) return settlementDate;
  return calcularDataDeCaixa(date, { type: "credit_card", ...conta });
}

function cicloDaFatura(dueDate: string, conta: ContaCartao) {
  if (!conta.statementClosingDay || !conta.paymentDueDay) {
    return { closingDate: dueDate, periodo: { inicio: dueDate, fim: dueDate } };
  }
  const closingDate = dataDeFechamentoDaFatura(
    dueDate,
    conta.statementClosingDay,
    conta.paymentDueDay,
  );
  return { closingDate, periodo: periodoDaFatura(closingDate) };
}

/**
 * Todas as faturas de um cartão, da mais recente para a mais antiga, com os
 * movimentos rastreáveis de cada uma.
 */
export async function getFaturasDoCartao(
  ledgerId: string,
  accountId: string,
): Promise<{ conta: (typeof accounts.$inferSelect) | null; faturas: Fatura[] }> {
  const [conta] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);

  if (!conta || conta.type !== "credit_card") return { conta: conta ?? null, faturas: [] };

  const contaCfg: ContaCartao = {
    id: conta.id,
    statementClosingDay: conta.statementClosingDay,
    paymentDueDay: conta.paymentDueDay,
  };

  // Movimentos (compras e estornos; a transferência de pagamento fica de fora
  // da fatura). Traz a origem: tipo do plano (compra/reparcelamento) e a fatura
  // reparcelada, quando houver.
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      status: transactions.status,
      date: transactions.date,
      settlementDate: transactions.settlementDate,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      supersededByPlanId: transactions.supersededByPlanId,
      planKind: installmentPlans.kind,
      sourceStatementId: installmentPlans.sourceStatementId,
      categorias: sql<string[]>`coalesce(
        array_agg(${categories.name} order by ${transactionSplits.sortOrder})
          filter (where ${categories.name} is not null),
        '{}'
      )`,
    })
    .from(transactions)
    .leftJoin(installmentPlans, eq(installmentPlans.id, transactions.installmentGroupId))
    .leftJoin(transactionSplits, eq(transactionSplits.transactionId, transactions.id))
    .leftJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.accountId, accountId),
        ne(transactions.type, "transfer"),
      ),
    )
    .groupBy(transactions.id, installmentPlans.kind, installmentPlans.sourceStatementId)
    .orderBy(desc(transactions.date));

  // Faturas já persistidas (fechadas/pagas/reparceladas).
  const stmts = await db
    .select()
    .from(creditCardStatements)
    .where(
      and(
        eq(creditCardStatements.ledgerId, ledgerId),
        eq(creditCardStatements.accountId, accountId),
      ),
    );
  const stmtPorVenc = new Map(stmts.map((s) => [s.dueDate, s]));
  const vencPorId = new Map(stmts.map((s) => [s.id, s.dueDate]));

  // Agrupa por vencimento.
  const grupos = new Map<string, MovimentoFatura[]>();
  for (const r of rows) {
    const due = chaveFatura(r.settlementDate, r.date, contaCfg);
    const mov: MovimentoFatura = {
      id: r.id,
      date: r.date,
      description: r.description,
      categorias: r.categorias ?? [],
      amount: r.amount,
      type: r.type === "income" ? "income" : "expense",
      status: r.status,
      installmentNumber: r.installmentNumber,
      installmentTotal: r.installmentTotal,
      ehReparcelamento: r.planKind === "reparcelamento",
      origemVencimento: r.sourceStatementId ? (vencPorId.get(r.sourceStatementId) ?? null) : null,
      reparcelada: r.supersededByPlanId != null,
    };
    const lista = grupos.get(due) ?? [];
    lista.push(mov);
    grupos.set(due, lista);
  }

  const hoje = hojeISO();
  const faturas: Fatura[] = [];
  for (const [dueDate, movs] of grupos) {
    const { closingDate, periodo } = cicloDaFatura(dueDate, contaCfg);
    const persistida = stmtPorVenc.get(dueDate);
    const status: StatusFatura = persistida
      ? (persistida.status as StatusFatura)
      : closingDate <= hoje
        ? "closed"
        : "open";

    // Total a pagar: compras somam, estornos subtraem; reparceladas saem.
    const total = movs.reduce((s, m) => {
      if (m.reparcelada) return s;
      return s + (m.type === "expense" ? m.amount : -m.amount);
    }, 0);

    movs.sort((a, b) => a.date.localeCompare(b.date));
    faturas.push({
      dueDate,
      closingDate,
      periodo,
      status,
      persistida: Boolean(persistida),
      statementId: persistida?.id ?? null,
      total,
      qtdMovimentos: movs.length,
      movimentos: movs,
    });
  }

  faturas.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return { conta, faturas };
}

export type ResumoCartao = {
  id: string;
  name: string;
  institution: string | null;
  currency: CurrencyCode;
  color: string | null;
  creditLimit: number | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  balance: number; // saldo devedor (negativo quando se deve)
  usage: number | null; // % do limite usado
  faturaAberta: { dueDate: string; closingDate: string; total: number } | null;
  qtdFaturas: number;
};

/** Cartões do espaço, com saldo, uso do limite e resumo da fatura aberta. */
export async function getCartoes(ledgerId: string): Promise<ResumoCartao[]> {
  const cards = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        eq(accounts.type, "credit_card"),
        sql`${accounts.archivedAt} is null`,
      ),
    )
    .orderBy(accounts.name);

  if (cards.length === 0) return [];

  const ids = cards.map((c) => c.id);
  const saldos = await db
    .select({
      accountId: transactions.accountId,
      mov: sql<number>`coalesce(sum(
        case
          when ${transactions.status} = 'pending' then 0
          when ${transactions.type} = 'expense' then -${transactions.amount}
          else ${transactions.amount}
        end
      ), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(inArray(transactions.accountId, ids))
    .groupBy(transactions.accountId);
  const saldoPorConta = new Map(saldos.map((s) => [s.accountId, s.mov]));

  const faturasPorCard = await Promise.all(cards.map((c) => getFaturasDoCartao(ledgerId, c.id)));

  return cards.map((c, i) => {
    const balance = c.openingBalance + (saldoPorConta.get(c.id) ?? 0);
    const usage =
      c.creditLimit && c.creditLimit > 0
        ? Math.min(100, Math.round((Math.abs(Math.min(0, balance)) / c.creditLimit) * 100))
        : null;

    // Fatura aberta = o ciclo corrente (vencimento calculado a partir de hoje).
    const faturas = faturasPorCard[i].faturas;
    let faturaAberta: ResumoCartao["faturaAberta"] = null;
    if (c.statementClosingDay && c.paymentDueDay) {
      const dueHoje = dataDePagamentoDaFatura(hojeISO(), c.statementClosingDay, c.paymentDueDay);
      const f = faturas.find((x) => x.dueDate === dueHoje);
      const { closingDate } = cicloDaFatura(dueHoje, {
        id: c.id,
        statementClosingDay: c.statementClosingDay,
        paymentDueDay: c.paymentDueDay,
      });
      faturaAberta = { dueDate: dueHoje, closingDate, total: f?.total ?? 0 };
    } else {
      const aberta = faturas.find((x) => x.status === "open") ?? null;
      if (aberta) {
        faturaAberta = { dueDate: aberta.dueDate, closingDate: aberta.closingDate, total: aberta.total };
      }
    }

    return {
      id: c.id,
      name: c.name,
      institution: c.institution,
      currency: c.currency,
      color: c.color,
      creditLimit: c.creditLimit,
      statementClosingDay: c.statementClosingDay,
      paymentDueDay: c.paymentDueDay,
      balance,
      usage,
      faturaAberta,
      qtdFaturas: faturas.length,
    };
  });
}
