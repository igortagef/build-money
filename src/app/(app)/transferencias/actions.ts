"use server";

import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";

export type TransferState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z
  .object({
    fromAccountId: z.string().uuid("Selecione a conta de origem"),
    toAccountId: z.string().uuid("Selecione a conta de destino"),
    amount: z.number().int().positive("O valor precisa ser maior que zero"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    description: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/**
 * Transferência entre duas contas do usuário.
 *
 * Uma transferência não é receita nem despesa — é dinheiro que muda de lugar.
 * Por isso as duas pernas têm type "transfer" (excluído dos relatórios de
 * resultado) e são ligadas por `transferPairId`, para poderem ser editadas e
 * apagadas como uma coisa só.
 *
 * Serve de base para: mover dinheiro entre contas, pagar a fatura do cartão
 * (corrente -> cartão) e as "rachas" (principal -> conta de rachas e volta).
 */
export async function createTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = schema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
    date: String(formData.get("date") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  // As duas contas precisam ser deste espaço.
  const contas = await db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(
      and(
        eq(accounts.ledgerId, ledgerId),
        or(eq(accounts.id, d.fromAccountId), eq(accounts.id, d.toAccountId)),
      ),
    );
  const origem = contas.find((c) => c.id === d.fromAccountId);
  const destino = contas.find((c) => c.id === d.toAccountId);
  if (!origem || !destino) {
    return { error: "Conta inválida." };
  }

  // Câmbio entre contas de moedas diferentes exigiria uma taxa; fica de fora
  // por ora para não fingir uma conversão que o usuário não informou.
  if (origem.currency !== destino.currency) {
    return {
      error:
        "Transferência entre moedas diferentes ainda não é suportada. Use contas da mesma moeda.",
    };
  }

  const par = crypto.randomUUID();
  const descPadrao = `Transferência: ${origem.name} → ${destino.name}`;
  const descricao = d.description || descPadrao;

  await db.transaction(async (trx) => {
    await trx.insert(transactions).values([
      {
        ledgerId,
        accountId: d.fromAccountId,
        createdByUserId: userId,
        type: "transfer",
        status: "cleared",
        // Perna de saída: negativa, debita a origem.
        amount: -d.amount,
        currency: origem.currency,
        amountBase: -d.amount,
        description: descricao,
        date: d.date,
        settlementDate: d.date,
        transferPairId: par,
      },
      {
        ledgerId,
        accountId: d.toAccountId,
        createdByUserId: userId,
        type: "transfer",
        status: "cleared",
        // Perna de entrada: positiva, credita o destino.
        amount: d.amount,
        currency: destino.currency,
        amountBase: d.amount,
        description: descricao,
        date: d.date,
        settlementDate: d.date,
        transferPairId: par,
      },
    ]);
  });

  revalidatePath("/lancamentos");
  revalidatePath("/");
  redirect("/lancamentos");
}

/** Apaga uma transferência inteira: as duas pernas somem juntas. */
export async function deleteTransfer(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const par = String(formData.get("pairId") ?? "");
  if (!par) return;

  // Pernas que tocam uma conta-piscina são aporte/resgate (Investimentos) ou
  // racha (Reembolsos): estão amarradas a um ativo/racha. Apagá-las aqui
  // deixaria o ativo inflado — o certo é gerenciar no Patrimônio/Rachas.
  const pernas = await db
    .select({
      isInvestmentPool: accounts.isInvestmentPool,
      isReimbursementPool: accounts.isReimbursementPool,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.ledgerId, ledgerId), eq(transactions.transferPairId, par)));
  if (pernas.some((p) => p.isInvestmentPool || p.isReimbursementPool)) return;

  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.transferPairId, par),
      ),
    );

  revalidatePath("/lancamentos");
  revalidatePath("/");
}
