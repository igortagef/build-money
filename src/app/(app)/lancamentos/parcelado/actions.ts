"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  categories,
  installmentPlans,
  transactions,
  transactionSplits,
} from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { gerarParcelas } from "@/lib/installments";

export type ParceladoState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  description: z.string().trim().min(1, "Descreva a compra").max(120),
  accountId: z.string().uuid("Selecione uma conta"),
  categoryId: z.string().uuid("Selecione uma categoria"),
  total: z.number().int().positive("O valor total precisa ser maior que zero"),
  parcelas: z.number().int().min(2, "Parcele em 2 ou mais").max(120),
  primeiraData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export async function createInstallment(
  _prev: ParceladoState,
  formData: FormData,
): Promise<ParceladoState> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = schema.safeParse({
    description: formData.get("description"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId"),
    total: parseMoney(String(formData.get("total") ?? "")) ?? 0,
    parcelas: Number(formData.get("parcelas") ?? 0),
    primeiraData: String(formData.get("primeiraData") ?? ""),
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  // Conta e categoria precisam ser deste espaço; parcelamento é sempre despesa,
  // então a categoria é de despesa.
  const [conta] = await db
    .select({
      id: accounts.id,
      currency: accounts.currency,
      type: accounts.type,
      statementClosingDay: accounts.statementClosingDay,
      paymentDueDay: accounts.paymentDueDay,
    })
    .from(accounts)
    .where(and(eq(accounts.id, d.accountId), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return { fieldErrors: { accountId: "Conta inválida" } };

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, d.categoryId),
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, "expense"),
      ),
    )
    .limit(1);
  if (!cat) return { fieldErrors: { categoryId: "Categoria inválida" } };

  const parcelas = gerarParcelas(d.total, d.parcelas, d.primeiraData, conta);

  await db.transaction(async (trx) => {
    const [plano] = await trx
      .insert(installmentPlans)
      .values({
        ledgerId,
        accountId: d.accountId,
        description: d.description,
        totalAmount: d.total,
        currency: conta.currency,
        installmentCount: d.parcelas,
        firstDueDate: d.primeiraData,
        purchaseDate: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: installmentPlans.id });

    for (const p of parcelas) {
      const [tx] = await trx
        .insert(transactions)
        .values({
          ledgerId,
          accountId: d.accountId,
          type: "expense",
          // Todas previstas: aparecem no fluxo antes de acontecer, e o usuário
          // confirma cada uma quando paga. A descrição já carrega "3/12".
          status: "pending",
          amount: p.valor,
          currency: conta.currency,
          amountBase: p.valor,
          description: `${d.description} (${p.numero}/${d.parcelas})`,
          date: p.data,
          settlementDate: p.dataCaixa,
          installmentGroupId: plano.id,
          installmentNumber: p.numero,
          installmentTotal: d.parcelas,
        })
        .returning({ id: transactions.id });

      await trx.insert(transactionSplits).values({
        transactionId: tx.id,
        categoryId: d.categoryId,
        amount: p.valor,
        amountBase: p.valor,
        sortOrder: 0,
      });
    }
  });

  revalidatePath("/lancamentos");
  revalidatePath("/");
  redirect("/lancamentos");
}
