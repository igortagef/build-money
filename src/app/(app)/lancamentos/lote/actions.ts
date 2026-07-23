"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, categories, transactions, transactionSplits } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { calcularDataDeCaixa } from "@/lib/statement";
import { aoRegistrarLancamento, semQuebrar } from "@/lib/gamification";

export type LoteResultado =
  | { ok: true; criados: number }
  | { ok: false; erro: string; linhasComErro?: number[] };

const linhaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descricao: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid(),
  amount: z.number().int().positive(),
});

const loteSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(["income", "expense"]),
  status: z.enum(["cleared", "pending"]),
  linhas: z.array(linhaSchema).min(1).max(200),
});

/**
 * Cria vários lançamentos de uma vez, todos na mesma conta e do mesmo tipo.
 *
 * Tudo entra numa única transação de banco: ou o lote inteiro grava, ou nada.
 * Um lote que falhasse na linha 30 e deixasse 29 lançamentos soltos seria
 * pior que falhar limpo — o usuário não saberia o que entrou.
 */
export async function createBatch(entrada: unknown): Promise<LoteResultado> {
  const { ledgerId, userId, baseCurrency } = await requireWriteAccess();

  const parsed = loteSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: "Há linhas incompletas ou inválidas." };
  }
  const { accountId, type, status, linhas } = parsed.data;

  const [conta] = await db
    .select({
      id: accounts.id,
      currency: accounts.currency,
      type: accounts.type,
      statementClosingDay: accounts.statementClosingDay,
      paymentDueDay: accounts.paymentDueDay,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return { ok: false, erro: "Conta inválida." };

  // Todas as categorias usadas precisam ser deste espaço e do tipo do lote.
  const idsCat = [...new Set(linhas.map((l) => l.categoryId))];
  const validas = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, type),
        inArray(categories.id, idsCat),
      ),
    );
  if (validas.length !== idsCat.length) {
    return { ok: false, erro: "Alguma categoria não pertence a este plano." };
  }

  // O lote assume a moeda da conta sem conversão (amountBase = amount): mistura
  // de moedas num lote seria raro e complicaria a colagem. Contas em moeda
  // estrangeira devem usar o lançamento individual, que trata câmbio.
  const naBase = conta.currency === baseCurrency;

  await db.transaction(async (trx) => {
    const registros = linhas.map((l) => ({
      ledgerId,
      accountId,
      createdByUserId: userId,
      type,
      status,
      amount: l.amount,
      currency: conta.currency,
      amountBase: l.amount,
      description: l.descricao,
      date: l.data,
      settlementDate: calcularDataDeCaixa(l.data, conta),
    }));

    const criadas = await trx
      .insert(transactions)
      .values(registros)
      .returning({ id: transactions.id });

    await trx.insert(transactionSplits).values(
      criadas.map((tx, i) => ({
        transactionId: tx.id,
        categoryId: linhas[i].categoryId,
        amount: linhas[i].amount,
        amountBase: linhas[i].amount,
        sortOrder: 0,
      })),
    );

    // Gamificação uma vez pelo lote, não por linha: dar XP a cada um dos 50
    // lançamentos viraria farm trivial. Avalia as conquistas de volume
    // (10, 100 lançamentos) com a contagem já atualizada.
    if (criadas.length > 0) {
      await semQuebrar(() =>
        aoRegistrarLancamento(userId, ledgerId, criadas[criadas.length - 1].id, 1),
      );
    }
  });

  // naBase é só informativo aqui; a gravação acima já ocorreu.
  void naBase;

  revalidatePath("/lancamentos");
  revalidatePath("/conquistas");
  revalidatePath("/");
  return { ok: true, criados: linhas.length };
}
