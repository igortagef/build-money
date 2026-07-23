import "server-only";
import { and, asc, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { monthRange } from "./queries";

/**
 * Conciliação de uma conta, segmentada por DIA.
 *
 * O extrato do banco fecha por dia, então a conferência eficiente compara
 * saldos, não itens: se o saldo de fechamento do dia bate, tudo até ali está
 * certo. Por isso cada dia traz DOIS saldos:
 *
 *   saldoLancado   — tudo que o app tem realizado até o fim daquele dia
 *   saldoConferido — só o que já foi batido com o extrato
 *
 * A diferença entre eles é exatamente o que falta confirmar.
 */
export type MovimentoDia = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  status: "cleared" | "reconciled";
  categorias: string[];
  assinado: number;
};

export type DiaConciliacao = {
  data: string;
  movimentos: MovimentoDia[];
  saldoLancado: number;
  saldoConferido: number;
  diferenca: number;
  aConferir: number;
  fechado: boolean;
};

const sinal = (tipo: string, amount: number) => (tipo === "expense" ? -amount : amount);

export async function getConciliacaoConta(
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

  // Saldos acumulados ANTES do mês: um para o lançado, outro para o conferido.
  const [ant] = await db
    .select({
      lancado: sql<number>`coalesce(sum(
        case when ${transactions.type} = 'expense' then -${transactions.amount} else ${transactions.amount} end
      ), 0)`.mapWith(Number),
      conferido: sql<number>`coalesce(sum(
        case when ${transactions.status} = 'reconciled'
          then case when ${transactions.type} = 'expense' then -${transactions.amount} else ${transactions.amount} end
          else 0 end
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

  const linhas = await db
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
        ne(transactions.status, "pending"),
        gte(transactions.date, start),
        lte(transactions.date, end),
        sql`${transactions.supersededByPlanId} is null`,
      ),
    )
    .groupBy(transactions.id)
    .orderBy(asc(transactions.date), asc(transactions.createdAt));

  // Agrupa por dia preservando a ordem.
  const porDia = new Map<string, typeof linhas>();
  for (const l of linhas) {
    const lista = porDia.get(l.date) ?? [];
    lista.push(l);
    porDia.set(l.date, lista);
  }

  let lancado = conta.openingBalance + (ant?.lancado ?? 0);
  let conferido = conta.openingBalance + (ant?.conferido ?? 0);

  const dias: DiaConciliacao[] = [];
  for (const [data, itens] of porDia) {
    const movimentos: MovimentoDia[] = itens.map((l) => ({
      id: l.id,
      description: l.description,
      amount: l.amount,
      type: l.type as MovimentoDia["type"],
      status: l.status as MovimentoDia["status"],
      categorias: l.categorias ?? [],
      assinado: sinal(l.type, l.amount),
    }));

    lancado += movimentos.reduce((s, m) => s + m.assinado, 0);
    conferido += movimentos
      .filter((m) => m.status === "reconciled")
      .reduce((s, m) => s + m.assinado, 0);

    const aConferir = movimentos.filter((m) => m.status !== "reconciled").length;
    dias.push({
      data,
      movimentos,
      saldoLancado: lancado,
      saldoConferido: conferido,
      diferenca: lancado - conferido,
      aConferir,
      fechado: aConferir === 0,
    });
  }

  // Linha de corte: até onde TUDO está conferido.
  const primeiroAberto = dias.find((d) => !d.fechado);
  const conferidoAte = primeiroAberto
    ? (dias[dias.indexOf(primeiroAberto) - 1]?.data ?? null)
    : (dias[dias.length - 1]?.data ?? null);

  return {
    conta,
    dias,
    conferidoAte,
    saldoFinalLancado: lancado,
    saldoFinalConferido: conferido,
    totalAConferir: dias.reduce((s, d) => s + d.aConferir, 0),
  };
}
