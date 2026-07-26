"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, bankStatementLines, categories, transactions, transactionSplits } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney, convertMoney } from "@/lib/money";
import { transactionInputSchema } from "@/lib/transactions";
import { aoConciliar, aoRegistrarLancamento, semQuebrar } from "@/lib/gamification";
import { resolverDataDeCaixa } from "@/lib/statement";

export type TxFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  splitError?: string;
};

/** Um rateio vindo do formulário, ainda em texto. */
const rawSplitSchema = z.object({
  categoryId: z.string(),
  amount: z.string(),
});

type Conta = {
  id: string;
  currency: "BRL" | "USD" | "EUR";
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

/**
 * Valida e normaliza os dados de um lançamento vindos do formulário.
 *
 * É a mesma validação para criar e editar, então mora aqui: divergência
 * entre os dois caminhos é como um lançamento passa a existir de um jeito que
 * a edição depois recusa. Devolve os dados prontos ou o estado de erro.
 */
async function validarLancamento(
  ledgerId: string,
  formData: FormData,
): Promise<
  | {
      ok: true;
      conta: Conta;
      tx: import("@/lib/transactions").TransactionInput;
      paraBase: number;
      settlementDate: string;
    }
  | { ok: false; state: TxFormState }
> {
  const rawSplits = JSON.parse(String(formData.get("splits") ?? "[]"));
  const parsedRaw = z.array(rawSplitSchema).safeParse(rawSplits);
  if (!parsedRaw.success) return { ok: false, state: { error: "Rateio inválido." } };

  const amount = parseMoney(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) {
    return {
      ok: false,
      state: { fieldErrors: { amount: "Informe um valor maior que zero" } },
    };
  }

  const accountId = String(formData.get("accountId") ?? "");
  const type = String(formData.get("type") ?? "expense");

  // O ledger do usuário é a fronteira: a conta precisa ser dele, senão
  // qualquer um poderia lançar na conta alheia chamando esta ação por POST.
  const [account] = await db
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

  if (!account) {
    return {
      ok: false,
      state: { fieldErrors: { accountId: "Selecione uma conta válida" } },
    };
  }

  const splits = parsedRaw.data
    .filter((s) => s.categoryId)
    .map((s) => ({ categoryId: s.categoryId, amount: parseMoney(s.amount) ?? 0 }));

  if (splits.length === 0) {
    return { ok: false, state: { splitError: "Informe ao menos uma categoria" } };
  }

  // As categorias também precisam pertencer ao ledger — e ser do mesmo tipo
  // do lançamento, para não cair despesa em categoria de receita.
  if (type !== "transfer") {
    const ids = splits.map((s) => s.categoryId);
    const validas = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.ledgerId, ledgerId),
          eq(categories.type, type === "income" ? "income" : "expense"),
          inArray(categories.id, ids),
        ),
      );
    if (validas.length !== new Set(ids).size) {
      return {
        ok: false,
        state: { splitError: "Alguma categoria não pertence a este plano" },
      };
    }
  }

  const taxa = Number(formData.get("exchangeRate") ?? 1) || 1;

  const parsed = transactionInputSchema.safeParse({
    accountId,
    type,
    status: String(formData.get("status") ?? "cleared"),
    amount,
    currency: account.currency,
    exchangeRate: taxa,
    description: String(formData.get("description") ?? ""),
    notes: String(formData.get("notes") ?? "") || null,
    date: String(formData.get("date") ?? ""),
    counterparty: String(formData.get("counterparty") ?? "") || null,
    splits,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    let splitError: string | undefined;
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "splits") splitError ??= issue.message;
      else {
        const key = String(issue.path[0] ?? "form");
        fieldErrors[key] ??= issue.message;
      }
    }
    return { ok: false, state: { fieldErrors, splitError } };
  }

  // Data de caixa: no cartão é o vencimento da fatura que contém a compra. O
  // usuário pode ter escolhido outra fatura (name="faturaVencimento"); a função
  // só aceita um vencimento candidato, senão cai no cálculo automático.
  const faturaEscolhida = String(formData.get("faturaVencimento") ?? "").trim() || null;
  const settlementDate = resolverDataDeCaixa(parsed.data.date, account, faturaEscolhida);

  return { ok: true, conta: account, tx: parsed.data, paraBase: taxa, settlementDate };
}

export async function createTransaction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const { ledgerId, userId, baseCurrency } = await requireWriteAccess();

  const v = await validarLancamento(ledgerId, formData);
  if (!v.ok) return v.state;

  const { conta: account, tx } = v;
  // Congela o valor na moeda base: relatórios antigos não podem mudar quando
  // o câmbio de hoje muda.
  const paraBase = account.currency === baseCurrency ? 1 : v.paraBase;

  let novoId = "";
  await db.transaction(async (trx) => {
    const [criada] = await trx
      .insert(transactions)
      .values({
        ledgerId,
        accountId: tx.accountId,
        createdByUserId: userId,
        type: tx.type,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        amountBase: convertMoney(tx.amount, paraBase),
        exchangeRate: String(paraBase),
        description: tx.description,
        notes: tx.notes ?? null,
        date: tx.date,
        // Vencimento da fatura (cartão) ou a própria data (demais contas),
        // já respeitando a fatura escolhida no formulário.
        settlementDate: v.settlementDate,
        counterparty: tx.counterparty ?? null,
      })
      .returning({ id: transactions.id });
    novoId = criada.id;

    await trx.insert(transactionSplits).values(
      tx.splits.map((s, i) => ({
        transactionId: criada.id,
        categoryId: s.categoryId,
        amount: s.amount,
        amountBase: convertMoney(s.amount, paraBase),
        sortOrder: i,
      })),
    );
  });

  // A gamificação vem DEPOIS de gravar e nunca derruba o lançamento:
  // se ela falhar, o dado financeiro do usuário está salvo do mesmo jeito.
  await semQuebrar(() =>
    aoRegistrarLancamento(userId, ledgerId, novoId, tx.splits.length),
  );

  revalidatePath("/lancamentos");
  revalidatePath("/conquistas");
  revalidatePath("/");
  redirect("/lancamentos");
}

/**
 * Edita um lançamento existente — inclusive um previsto, que é como uma conta
 * fixa de valor variável (energia, água) recebe o valor real do mês.
 *
 * A edição NÃO concede XP de novo: o lançamento já rendeu na criação, e pagar
 * pelo mesmo fato duas vezes quebraria a economia da gamificação. Também
 * mantém o vínculo com a regra recorrente (recurringRuleId), então um previsto
 * editado continua sendo aquela parcela — a provisão não o recria.
 */
export async function updateTransaction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const { ledgerId, baseCurrency } = await requireWriteAccess();

  const id = String(formData.get("id") ?? "");

  // O lançamento precisa ser deste espaço. Guardamos o status atual porque a
  // edição não deve rebaixar um lançamento (ex.: conciliado volta a cleared)
  // sem intenção — a edição preserva o estado, só muda os valores.
  const [existente] = await db
    .select({ id: transactions.id, status: transactions.status })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)))
    .limit(1);

  if (!existente) return { error: "Lançamento não encontrado." };

  const v = await validarLancamento(ledgerId, formData);
  if (!v.ok) return v.state;

  const { conta: account, tx } = v;
  const paraBase = account.currency === baseCurrency ? 1 : v.paraBase;

  // Editar um lançamento JÁ conciliado reabre a conferência: o que foi batido
  // com o extrato mudou, então precisa ser reconferido. O status volta a
  // "cleared" (pendente de conciliação) e o vínculo com a linha do extrato é
  // desfeito — a linha importada volta para a fila.
  const reabreConciliacao = existente.status === "reconciled";

  await db.transaction(async (trx) => {
    await trx
      .update(transactions)
      .set({
        accountId: tx.accountId,
        type: tx.type,
        // Conciliado -> reabre (cleared). Caso contrário, respeita o seletor.
        status: reabreConciliacao ? "cleared" : tx.status,
        reconciledAt: reabreConciliacao ? null : undefined,
        amount: tx.amount,
        currency: tx.currency,
        amountBase: convertMoney(tx.amount, paraBase),
        exchangeRate: String(paraBase),
        description: tx.description,
        notes: tx.notes ?? null,
        date: tx.date,
        settlementDate: v.settlementDate,
        counterparty: tx.counterparty ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));

    if (reabreConciliacao) {
      // A linha do extrato que estava casada com este lançamento volta a ficar
      // pendente, para ser reconciliada com o valor já corrigido.
      await trx
        .update(bankStatementLines)
        .set({ status: "pendente", transactionId: null })
        .where(
          and(
            eq(bankStatementLines.transactionId, id),
            eq(bankStatementLines.ledgerId, ledgerId),
          ),
        );
    }

    // Rateios são substituídos por inteiro: comparar linha a linha para achar
    // o que mudou seria mais código e mais chance de erro do que apagar e
    // reinserir, e o conjunto é pequeno.
    await trx
      .delete(transactionSplits)
      .where(eq(transactionSplits.transactionId, id));

    await trx.insert(transactionSplits).values(
      tx.splits.map((s, i) => ({
        transactionId: id,
        categoryId: s.categoryId,
        amount: s.amount,
        amountBase: convertMoney(s.amount, paraBase),
        sortOrder: i,
      })),
    );
  });

  revalidatePath("/lancamentos");
  revalidatePath("/");
  redirect("/lancamentos");
}

export async function deleteTransaction(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  await db.transaction(async (trx) => {
    // Se estava conciliado com uma linha do extrato, a linha volta para a fila
    // (pendente): o extrato é o espelho e precisa reapontar o que sumiu.
    await trx
      .update(bankStatementLines)
      .set({ status: "pendente", transactionId: null })
      .where(and(eq(bankStatementLines.transactionId, id), eq(bankStatementLines.ledgerId, ledgerId)));
    // O filtro por ledger é o que impede apagar lançamento de outra pessoa.
    await trx
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));
  });

  revalidatePath("/lancamentos");
  revalidatePath("/conciliacao");
  revalidatePath("/");
}

/**
 * Marca (ou desmarca) um lançamento como conferido com o extrato.
 * É a conciliação em sua forma mais simples: o usuário bate o lançamento
 * contra o que viu no banco e dá o "ok".
 */
export async function toggleReconciled(formData: FormData) {
  const { ledgerId, userId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  const [tx] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      accountId: transactions.accountId,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)))
    .limit(1);

  if (!tx) return;

  // Previsto não se concilia: ainda não aconteceu no extrato.
  if (tx.status === "pending") return;

  const conciliando = tx.status !== "reconciled";

  await db
    .update(transactions)
    .set({
      status: conciliando ? "reconciled" : "cleared",
      reconciledAt: conciliando ? new Date() : null,
    })
    .where(and(eq(transactions.id, id), eq(transactions.ledgerId, ledgerId)));

  if (conciliando) {
    await semQuebrar(() =>
      aoConciliar(userId, ledgerId, tx.id, tx.accountId, tx.date),
    );
  }

  revalidatePath("/lancamentos");
  revalidatePath("/conciliacao");
  revalidatePath("/");
}
