import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, ledgers, recurringRules, transactions, transactionSplits } from "@/db/schema";
import { ocorrencias, horizonte, type Regra } from "./recurrence";
import { calcularDataDeCaixa } from "./statement";

/**
 * Provisão: transforma as regras de contas fixas em lançamentos previstos.
 *
 * Roda quando o usuário abre o app. Duas garantias importantes:
 *
 * 1. **Idempotente.** O índice único (recurring_rule_id, date) impede que a
 *    mesma parcela entre duas vezes, mesmo se duas abas dispararem a provisão
 *    ao mesmo tempo. `onConflictDoNothing` transforma a corrida em no-op.
 * 2. **Nunca mexe no passado.** Só gera à frente de `generatedThrough`, então
 *    um lançamento que o usuário já confirmou ou editou não é recriado.
 */

export async function provisionarLedger(ledgerId: string): Promise<number> {
  const regras = await db
    .select({
      id: recurringRules.id,
      accountId: recurringRules.accountId,
      categoryId: recurringRules.categoryId,
      type: recurringRules.type,
      description: recurringRules.description,
      amount: recurringRules.amount,
      currency: recurringRules.currency,
      frequency: recurringRules.frequency,
      dayOfMonth: recurringRules.dayOfMonth,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      generatedThrough: recurringRules.generatedThrough,
      autoConfirm: recurringRules.autoConfirm,
      contaTipo: accounts.type,
      fechamento: accounts.statementClosingDay,
      vencimento: accounts.paymentDueDay,
    })
    .from(recurringRules)
    // leftJoin: regras SEM conta também entram (usam a conta padrão do espaço).
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .where(
      and(eq(recurringRules.ledgerId, ledgerId), eq(recurringRules.active, true)),
    );

  if (regras.length === 0) return 0;

  // Conta padrão do espaço + sua configuração (para o caixa no cartão).
  const [espaco] = await db
    .select({
      contaPadraoId: ledgers.defaultPaymentAccountId,
      padraoTipo: accounts.type,
      padraoFechamento: accounts.statementClosingDay,
      padraoVencimento: accounts.paymentDueDay,
    })
    .from(ledgers)
    .leftJoin(accounts, eq(accounts.id, ledgers.defaultPaymentAccountId))
    .where(eq(ledgers.id, ledgerId))
    .limit(1);

  const ate = horizonte();
  let criados = 0;

  for (const r of regras) {
    const regra: Regra = {
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth,
      startDate: r.startDate,
      endDate: r.endDate,
    };

    // Conta efetiva: a da regra ou, sem ela, a conta padrão do espaço. Sem
    // nenhuma das duas, não dá para prever (o previsto precisa de conta) —
    // a regra fica como lembrete até definir a conta padrão.
    const contaId = r.accountId ?? espaco?.contaPadraoId ?? null;
    if (!contaId) continue;
    const usaPadrao = !r.accountId;
    const contaTipo = usaPadrao ? espaco?.padraoTipo : r.contaTipo;
    const fechamento = usaPadrao ? espaco?.padraoFechamento : r.fechamento;
    const vencimento = usaPadrao ? espaco?.padraoVencimento : r.vencimento;

    const datas = ocorrencias(regra, r.generatedThrough, ate);
    if (datas.length === 0) continue;

    for (const data of datas) {
      const [tx] = await db
        .insert(transactions)
        .values({
          ledgerId,
          accountId: contaId,
          recurringRuleId: r.id,
          type: r.type,
          // Previsto: ainda não aconteceu. Vira "cleared" quando o usuário
          // confirma — ou sozinho, se a regra for de confirmação automática.
          status: "pending",
          amount: r.amount,
          currency: r.currency,
          amountBase: r.amount,
          description: r.description,
          date: data,
          settlementDate: calcularDataDeCaixa(data, {
            type: contaTipo ?? "checking",
            statementClosingDay: fechamento ?? null,
            paymentDueDay: vencimento ?? null,
          }),
        })
        // A trava do banco: se já existe para esta regra e data, ignora.
        // `targetWhere` repete o predicado do índice PARCIAL — sem ele o
        // Postgres não reconhece o índice e recusa o ON CONFLICT.
        .onConflictDoNothing({
          target: [transactions.recurringRuleId, transactions.date],
          where: sql`${transactions.recurringRuleId} is not null`,
        })
        .returning({ id: transactions.id });

      // Sem `tx`, a parcela já existia — nada a fazer.
      if (!tx) continue;
      criados++;

      if (r.categoryId) {
        await db.insert(transactionSplits).values({
          transactionId: tx.id,
          categoryId: r.categoryId,
          amount: r.amount,
          amountBase: r.amount,
          sortOrder: 0,
        });
      }
    }

    await db
      .update(recurringRules)
      .set({ generatedThrough: datas[datas.length - 1] })
      .where(eq(recurringRules.id, r.id));
  }

  return criados;
}

/**
 * Confirma automaticamente os previstos que já venceram, para as regras
 * marcadas como automáticas (débito em conta, por exemplo: o dinheiro sai
 * sozinho, e pedir confirmação seria burocracia).
 */
export async function confirmarAutomaticos(ledgerId: string): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);

  const r = await db
    .update(transactions)
    .set({ status: "cleared" })
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "pending"),
        lte(transactions.date, hoje),
        sql`${transactions.recurringRuleId} in (
          select id from ${recurringRules}
          where ledger_id = ${ledgerId} and auto_confirm = true
        )`,
      ),
    )
    .returning({ id: transactions.id });

  return r.length;
}

/** Contas fixas cadastradas, com o próximo vencimento. */
export async function getContasFixas(ledgerId: string) {
  return db
    .select({
      id: recurringRules.id,
      description: recurringRules.description,
      amount: recurringRules.amount,
      currency: recurringRules.currency,
      type: recurringRules.type,
      frequency: recurringRules.frequency,
      dayOfMonth: recurringRules.dayOfMonth,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
      autoConfirm: recurringRules.autoConfirm,
      active: recurringRules.active,
      accountName: accounts.name,
      accountId: recurringRules.accountId,
      categoryId: recurringRules.categoryId,
      // Próxima parcela ainda não confirmada desta regra.
      proximo: sql<string | null>`(
        select min(t.date) from ${transactions} t
        where t.recurring_rule_id = ${recurringRules.id}
          and t.status = 'pending'
          and t.date >= current_date
      )`,
    })
    .from(recurringRules)
    // leftJoin: a conta é opcional; regras sem conta usam a padrão do espaço.
    .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
    .where(eq(recurringRules.ledgerId, ledgerId))
    .orderBy(asc(recurringRules.active), asc(recurringRules.description));
}
