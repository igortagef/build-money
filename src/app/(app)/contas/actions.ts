"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, reimbursables, transactions } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { aoCadastrarConta, semQuebrar } from "@/lib/gamification";
import { BANCOS } from "@/lib/banks";

export type AccountFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome à conta").max(80),
    type: z.enum(["checking", "savings", "credit_card", "cash", "investment"], {
      message: "Selecione o tipo",
    }),
    currency: z.enum(["BRL", "USD", "EUR"]),
    institution: z.string().trim().max(80).optional(),
    openingBalance: z.number().int(),
    creditLimit: z.number().int().nonnegative().nullable(),
    statementClosingDay: z.number().int().min(1).max(31).nullable(),
    paymentDueDay: z.number().int().min(1).max(31).nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "credit_card") return;
    if (data.statementClosingDay === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statementClosingDay"],
        message: "Informe o dia do fechamento da fatura",
      });
    }
    if (data.paymentDueDay === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentDueDay"],
        message: "Informe o dia do vencimento",
      });
    }
  });

function optionalInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export async function createAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  // Server Actions são endpoints POST públicos — a checagem vem antes de tudo.
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    institution: String(formData.get("institution") ?? "").trim() || undefined,
    openingBalance: parseMoney(String(formData.get("openingBalance") ?? "")) ?? 0,
    creditLimit: parseMoney(String(formData.get("creditLimit") ?? "")),
    statementClosingDay: optionalInt(formData.get("statementClosingDay")),
    paymentDueDay: optionalInt(formData.get("paymentDueDay")),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  // Banco escolhido (guardado em `icon`) e sua cor de marca (em `color`). Só
  // aceita ids do catálogo, para não guardar valor arbitrário.
  const bankRaw = String(formData.get("bank") ?? "");
  const bancoId = BANCOS.some((b) => b.id === bankRaw) ? bankRaw : null;
  const corRaw = String(formData.get("color") ?? "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(corRaw) ? corRaw : null;

  await db.insert(accounts).values({
    ledgerId,
    name: data.name,
    type: data.type,
    currency: data.currency,
    institution: data.institution ?? null,
    openingBalance: data.openingBalance,
    openingBalanceDate: today,
    creditLimit: data.type === "credit_card" ? data.creditLimit : null,
    statementClosingDay:
      data.type === "credit_card" ? data.statementClosingDay : null,
    paymentDueDay: data.type === "credit_card" ? data.paymentDueDay : null,
    icon: bancoId,
    color,
  });

  await semQuebrar(() => aoCadastrarConta(userId, ledgerId));

  revalidatePath("/contas");
  revalidatePath("/conquistas");
  revalidatePath("/");
  redirect("/contas");
}

/** Edita uma conta já cadastrada. Não mexe nos lançamentos existentes. */
export async function updateAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  const [existente] = await db
    .select({ id: accounts.id, isReimbursementPool: accounts.isReimbursementPool, isInvestmentPool: accounts.isInvestmentPool })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!existente) return { error: "Conta não encontrada." };
  if (existente.isReimbursementPool || existente.isInvestmentPool) {
    return { error: "Esta é uma conta interna do sistema e não pode ser editada." };
  }

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    institution: String(formData.get("institution") ?? "").trim() || undefined,
    openingBalance: parseMoney(String(formData.get("openingBalance") ?? "")) ?? 0,
    creditLimit: parseMoney(String(formData.get("creditLimit") ?? "")),
    statementClosingDay: optionalInt(formData.get("statementClosingDay")),
    paymentDueDay: optionalInt(formData.get("paymentDueDay")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }
  const data = parsed.data;

  const bankRaw = String(formData.get("bank") ?? "");
  const bancoId = BANCOS.some((b) => b.id === bankRaw) ? bankRaw : null;
  const corRaw = String(formData.get("color") ?? "").trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(corRaw) ? corRaw : null;

  await db
    .update(accounts)
    .set({
      name: data.name,
      type: data.type,
      currency: data.currency,
      institution: data.institution ?? null,
      openingBalance: data.openingBalance,
      creditLimit: data.type === "credit_card" ? data.creditLimit : null,
      statementClosingDay: data.type === "credit_card" ? data.statementClosingDay : null,
      paymentDueDay: data.type === "credit_card" ? data.paymentDueDay : null,
      icon: bancoId,
      color,
    })
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)));

  revalidatePath("/contas");
  revalidatePath("/");
  redirect("/contas");
}

export type ExcluirContaState = { erro?: string };

/**
 * Exclui uma conta. Só é possível se ela NÃO tiver lançamentos nem rachas
 * vinculados — apagar uma conta com histórico corromperia relatórios. Nesse
 * caso, oriente a arquivar (a fazer) em vez de excluir.
 */
export async function deleteAccount(
  _prev: ExcluirContaState,
  formData: FormData,
): Promise<ExcluirContaState> {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  const [conta] = await db
    .select({ id: accounts.id, isReimbursementPool: accounts.isReimbursementPool, isInvestmentPool: accounts.isInvestmentPool })
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)))
    .limit(1);
  if (!conta) return { erro: "Conta não encontrada." };
  if (conta.isReimbursementPool || conta.isInvestmentPool) {
    return { erro: "Esta é uma conta interna do sistema e não pode ser excluída." };
  }

  const [{ n: nLanc }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(transactions)
    .where(eq(transactions.accountId, id));
  const [{ n: nRacha }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(reimbursables)
    .where(eq(reimbursables.accountId, id));
  if (nLanc > 0 || nRacha > 0) {
    return { erro: "Esta conta tem lançamentos e não pode ser excluída sem perder o histórico." };
  }

  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.ledgerId, ledgerId)));

  revalidatePath("/contas");
  revalidatePath("/");
  redirect("/contas");
}
