"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, categories, recurringRules, transactions, transactionSplits } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { calcularDataDeCaixa } from "@/lib/statement";
import { provisionarLedger } from "@/lib/provisioning";

export type ReceitaState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

async function validarContaCategoria(
  ledgerId: string,
  accountId: string,
  categoryId: string | null,
) {
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
  if (!conta) return { conta: null, categoriaOk: false };

  let categoriaOk = true;
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.ledgerId, ledgerId),
          eq(categories.type, "income"),
        ),
      )
      .limit(1);
    categoriaOk = !!cat;
  }
  return { conta, categoriaOk };
}

const variavelSchema = z.object({
  accountId: z.string().uuid("Selecione uma conta"),
  description: z.string().trim().min(1, "Descreva a receita").max(120),
  amount: z.number().int().positive("O valor precisa ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().uuid().nullish(),
});

/**
 * Receita variável futura: uma entrada pontual esperada (freela, bônus, venda).
 * Vira um lançamento de receita PREVISTO na data escolhida — entra no fluxo de
 * caixa projetado e você confirma quando o dinheiro cair.
 */
export async function provisionarReceitaVariavel(
  _prev: ReceitaState,
  formData: FormData,
): Promise<ReceitaState> {
  const { ledgerId, userId, baseCurrency } = await requireWriteAccess();

  const parsed = variavelSchema.safeParse({
    accountId: formData.get("accountId"),
    description: formData.get("description"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
    date: String(formData.get("date") ?? ""),
    categoryId: String(formData.get("categoryId") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const { conta, categoriaOk } = await validarContaCategoria(
    ledgerId,
    d.accountId,
    d.categoryId ?? null,
  );
  if (!conta) return { fieldErrors: { accountId: "Conta inválida" } };
  if (!categoriaOk) return { fieldErrors: { categoryId: "Categoria inválida" } };

  const naBase = conta.currency === baseCurrency;

  await db.transaction(async (trx) => {
    const [tx] = await trx
      .insert(transactions)
      .values({
        ledgerId,
        accountId: d.accountId,
        createdByUserId: userId,
        type: "income",
        status: "pending",
        amount: d.amount,
        currency: conta.currency,
        amountBase: d.amount,
        description: d.description,
        date: d.date,
        settlementDate: calcularDataDeCaixa(d.date, conta),
      })
      .returning({ id: transactions.id });

    if (d.categoryId) {
      await trx.insert(transactionSplits).values({
        transactionId: tx.id,
        categoryId: d.categoryId,
        amount: d.amount,
        amountBase: d.amount,
        sortOrder: 0,
      });
    }
  });

  void naBase;
  revalidatePath("/receitas-previstas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios/fluxo");
  revalidatePath("/");
  return { ok: true };
}

const fixaSchema = z
  .object({
    accountId: z.string().uuid("Selecione uma conta"),
    description: z.string().trim().min(1, "Descreva a receita").max(120),
    amount: z.number().int().positive("O valor precisa ser maior que zero"),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual"]),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    categoryId: z.string().uuid().nullish(),
  })
  .superRefine((d, ctx) => {
    const precisaDia = !["weekly", "biweekly"].includes(d.frequency);
    if (precisaDia && d.dayOfMonth === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayOfMonth"], message: "Informe o dia" });
    }
    if (d.endDate && d.endDate < d.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "O fim não pode ser antes do início" });
    }
  });

/**
 * Receita fixa futura: uma entrada recorrente (salário, aluguel recebido,
 * pró-labore). Cria uma regra de recorrência de receita e já provisiona as
 * próximas ocorrências como previstas, que aparecem no fluxo projetado.
 */
export async function provisionarReceitaFixa(
  _prev: ReceitaState,
  formData: FormData,
): Promise<ReceitaState> {
  const { ledgerId } = await requireWriteAccess();

  const dia = String(formData.get("dayOfMonth") ?? "").trim();
  const fim = String(formData.get("endDate") ?? "").trim();

  const parsed = fixaSchema.safeParse({
    accountId: formData.get("accountId"),
    description: formData.get("description"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
    frequency: formData.get("frequency"),
    dayOfMonth: dia ? Number(dia) : null,
    startDate: String(formData.get("startDate") ?? ""),
    endDate: fim || null,
    categoryId: String(formData.get("categoryId") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const { conta, categoriaOk } = await validarContaCategoria(
    ledgerId,
    d.accountId,
    d.categoryId ?? null,
  );
  if (!conta) return { fieldErrors: { accountId: "Conta inválida" } };
  if (!categoriaOk) return { fieldErrors: { categoryId: "Categoria inválida" } };

  await db.insert(recurringRules).values({
    ledgerId,
    accountId: d.accountId,
    categoryId: d.categoryId ?? null,
    type: "income",
    description: d.description,
    amount: d.amount,
    currency: conta.currency,
    frequency: d.frequency,
    dayOfMonth: d.dayOfMonth,
    startDate: d.startDate,
    endDate: d.endDate,
    autoConfirm: false,
    active: true,
  });

  // Materializa já as próximas ocorrências previstas.
  await provisionarLedger(ledgerId);

  revalidatePath("/receitas-previstas");
  revalidatePath("/contas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios/fluxo");
  revalidatePath("/");
  return { ok: true };
}

/** Remove uma receita prevista variável (lançamento avulso previsto). */
export async function removerReceitaPrevista(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  // Só remove previsto e avulso: uma ocorrência de regra recorrente é gerida na
  // própria conta a receber (senão a provisão a recriaria).
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.ledgerId, ledgerId),
        eq(transactions.status, "pending"),
        eq(transactions.type, "income"),
      ),
    );

  revalidatePath("/receitas-previstas");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}
