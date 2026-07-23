import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  creditCardStatements,
  installmentPlans,
  transactions,
  transactionSplits,
} from "@/db/schema";
import { getFaturasDoCartao } from "./faturas";
import { gerarParcelas } from "./installments";
import { somarMeses } from "./recurrence";

/**
 * Operações que MUDAM as faturas: fechamento (manual e automático), marcar
 * paga e reparcelamento. Ficam separadas da leitura (`faturas.ts`) porque
 * escrevem no banco e rodam tanto de server actions quanto da provisão.
 */

export type OpFaturaResult = { ok: boolean; erro?: string; statementId?: string };

/**
 * Fecha uma fatura: congela o total e carimba as compras do ciclo com o
 * statement_id. Idempotente — se a fatura já foi fechada/paga/reparcelada, não
 * rebaixa o status; apenas garante o carimbo. Espelha o fechamento do banco.
 */
export async function fecharFatura(
  ledgerId: string,
  accountId: string,
  dueDate: string,
): Promise<OpFaturaResult> {
  const { conta, faturas } = await getFaturasDoCartao(ledgerId, accountId);
  if (!conta || conta.type !== "credit_card") {
    return { ok: false, erro: "Cartão inválido." };
  }

  const fatura = faturas.find((f) => f.dueDate === dueDate);
  if (!fatura) return { ok: false, erro: "Fatura não encontrada." };

  // Não carimba as parcelas reparceladas (elas saíram desta fatura).
  const ids = fatura.movimentos.filter((m) => !m.reparcelada).map((m) => m.id);

  // A trava (account_id, due_date) transforma a corrida entre o fechamento
  // manual e o automático num no-op: quem chega primeiro cria.
  const [criada] = await db
    .insert(creditCardStatements)
    .values({
      ledgerId,
      accountId,
      closingDate: fatura.closingDate,
      dueDate,
      status: "closed",
      totalAmount: fatura.total,
      closedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [creditCardStatements.accountId, creditCardStatements.dueDate],
    })
    .returning({ id: creditCardStatements.id });

  let statementId = criada?.id;
  if (!statementId) {
    const [existente] = await db
      .select({ id: creditCardStatements.id })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.accountId, accountId),
          eq(creditCardStatements.dueDate, dueDate),
        ),
      )
      .limit(1);
    statementId = existente?.id;
  }
  if (!statementId) return { ok: false, erro: "Não foi possível fechar a fatura." };

  if (ids.length > 0) {
    await db
      .update(transactions)
      .set({ statementId })
      .where(and(eq(transactions.ledgerId, ledgerId), inArray(transactions.id, ids)));
  }

  return { ok: true, statementId };
}

/** Marca uma fatura como paga (ou desfaz, voltando a "fechada"). */
export async function alternarFaturaPaga(
  ledgerId: string,
  statementId: string,
): Promise<OpFaturaResult> {
  const [stmt] = await db
    .select({ id: creditCardStatements.id, status: creditCardStatements.status })
    .from(creditCardStatements)
    .where(
      and(
        eq(creditCardStatements.id, statementId),
        eq(creditCardStatements.ledgerId, ledgerId),
      ),
    )
    .limit(1);
  if (!stmt) return { ok: false, erro: "Fatura não encontrada." };
  if (stmt.status === "reparcelada") {
    return { ok: false, erro: "Fatura reparcelada não é quitada diretamente." };
  }

  const pagando = stmt.status !== "paid";
  await db
    .update(creditCardStatements)
    .set({ status: pagando ? "paid" : "closed", paidAt: pagando ? new Date() : null })
    .where(eq(creditCardStatements.id, statementId));

  return { ok: true, statementId };
}

/**
 * Reparcela (refinancia) uma fatura: substitui as PARCELAS EM ABERTO (previstas,
 * ainda não pagas) por um novo plano de parcelas, com juros opcional.
 *
 * É financeiramente seguro porque só toca no que é "pending": os previstos não
 * entram em nenhum relatório realizado (competência/caixa/saldo), então trocar
 * previstos antigos por novos apenas remaneja o fluxo futuro — sem duplicar.
 * As parcelas originais ficam no histórico (marcadas `superseded_by_plan_id`),
 * rastreáveis; o novo plano guarda a fatura de origem (`source_statement_id`).
 */
export async function reparcelarFatura(
  ledgerId: string,
  accountId: string,
  dueDate: string,
  opts: { parcelas: number; jurosCentavos?: number; primeiraData?: string },
): Promise<OpFaturaResult> {
  const { conta, faturas } = await getFaturasDoCartao(ledgerId, accountId);
  if (!conta || conta.type !== "credit_card") return { ok: false, erro: "Cartão inválido." };

  const fatura = faturas.find((f) => f.dueDate === dueDate);
  if (!fatura) return { ok: false, erro: "Fatura não encontrada." };

  const parcelas = opts.parcelas;
  if (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > 120) {
    return { ok: false, erro: "Informe de 2 a 120 parcelas." };
  }

  // Alvos: parcelas em aberto (previstas) desta fatura, ainda não reparceladas.
  const alvos = fatura.movimentos.filter(
    (m) => m.status === "pending" && !m.reparcelada && m.type === "expense",
  );
  const total = alvos.reduce((s, m) => s + m.amount, 0);
  if (total <= 0) {
    return { ok: false, erro: "Esta fatura não tem parcelas em aberto para reparcelar." };
  }

  const juros = Math.max(0, Math.round(opts.jurosCentavos ?? 0));
  const totalFinanciado = total + juros;
  const alvoIds = alvos.map((a) => a.id);

  // Herda a categoria de uma das parcelas originais, para o novo plano manter o
  // tipo de gasto no relatório.
  const [split] = await db
    .select({ categoryId: transactionSplits.categoryId })
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, alvoIds))
    .limit(1);
  const categoryId = split?.categoryId ?? null;

  // Primeira parcela no mês seguinte ao vencimento da fatura reparcelada.
  const primeiraData = opts.primeiraData ?? somarMeses(dueDate, 1, Number(dueDate.slice(8, 10)));
  const novas = gerarParcelas(totalFinanciado, parcelas, primeiraData, {
    type: "credit_card",
    statementClosingDay: conta.statementClosingDay,
    paymentDueDay: conta.paymentDueDay,
  });

  const hoje = new Date().toISOString().slice(0, 10);

  await db.transaction(async (trx) => {
    // Fatura de origem: cria/marca como reparcelada.
    const [criada] = await trx
      .insert(creditCardStatements)
      .values({
        ledgerId,
        accountId,
        closingDate: fatura.closingDate,
        dueDate,
        status: "reparcelada",
        totalAmount: fatura.total,
        closedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [creditCardStatements.accountId, creditCardStatements.dueDate],
      })
      .returning({ id: creditCardStatements.id });

    let statementId = criada?.id;
    if (!statementId) {
      const [ex] = await trx
        .select({ id: creditCardStatements.id })
        .from(creditCardStatements)
        .where(
          and(
            eq(creditCardStatements.accountId, accountId),
            eq(creditCardStatements.dueDate, dueDate),
          ),
        )
        .limit(1);
      statementId = ex!.id;
      await trx
        .update(creditCardStatements)
        .set({ status: "reparcelada" })
        .where(eq(creditCardStatements.id, statementId));
    }

    // Novo plano, vinculado à fatura de origem.
    const [plano] = await trx
      .insert(installmentPlans)
      .values({
        ledgerId,
        accountId,
        description: `Reparcelamento da fatura de ${dueDate}`,
        totalAmount: totalFinanciado,
        currency: conta.currency,
        installmentCount: parcelas,
        firstDueDate: primeiraData,
        purchaseDate: hoje,
        kind: "reparcelamento",
        sourceStatementId: statementId,
      })
      .returning({ id: installmentPlans.id });

    await trx
      .update(creditCardStatements)
      .set({ reparceladoPlanId: plano.id })
      .where(eq(creditCardStatements.id, statementId));

    // Novas parcelas (previstas).
    for (const p of novas) {
      const [tx] = await trx
        .insert(transactions)
        .values({
          ledgerId,
          accountId,
          type: "expense",
          status: "pending",
          amount: p.valor,
          currency: conta.currency,
          amountBase: p.valor,
          description: `Reparcelamento ${dueDate} (${p.numero}/${parcelas})`,
          date: p.data,
          settlementDate: p.dataCaixa,
          installmentGroupId: plano.id,
          installmentNumber: p.numero,
          installmentTotal: parcelas,
        })
        .returning({ id: transactions.id });

      if (categoryId) {
        await trx.insert(transactionSplits).values({
          transactionId: tx.id,
          categoryId,
          amount: p.valor,
          amountBase: p.valor,
          sortOrder: 0,
        });
      }
    }

    // As parcelas originais saem do "a pagar" e do fluxo, mas ficam no histórico.
    await trx
      .update(transactions)
      .set({ supersededByPlanId: plano.id })
      .where(inArray(transactions.id, alvoIds));
  });

  return { ok: true };
}

/**
 * Fecha automaticamente todas as faturas cujo ciclo já encerrou (data de
 * fechamento <= hoje) e que ainda não têm registro. Roda na provisão, ao abrir
 * o app — como o banco, que fecha sozinho na data.
 */
export async function fecharFaturasVencidas(ledgerId: string): Promise<number> {
  const cartoes = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        eq(accounts.type, "credit_card"),
        sql`${accounts.archivedAt} is null`,
      ),
    );

  let fechadas = 0;
  for (const c of cartoes) {
    const { faturas } = await getFaturasDoCartao(ledgerId, c.id);
    for (const f of faturas) {
      // "closed" derivado (não persistido) = ciclo encerrou mas ainda não há
      // registro. Persiste. As abertas (ciclo corrente) ficam de fora.
      if (!f.persistida && f.status === "closed") {
        const r = await fecharFatura(ledgerId, c.id, f.dueDate);
        if (r.ok) fechadas++;
      }
    }
  }
  return fechadas;
}
