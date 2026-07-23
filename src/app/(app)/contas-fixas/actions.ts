"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, categories, recurringRules, transactions } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { provisionarLedger } from "@/lib/provisioning";

export type FixaFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z
  .object({
    description: z.string().trim().min(1, "Descreva a conta").max(120),
    type: z.enum(["income", "expense"]),
    accountId: z.string().uuid("Selecione uma conta"),
    categoryId: z.string().uuid("Selecione uma categoria"),
    amount: z.number().int().positive("O valor precisa ser maior que zero"),
    frequency: z.enum([
      "weekly",
      "biweekly",
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
    ]),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    autoConfirm: z.boolean(),
  })
  .superRefine((d, ctx) => {
    // Frequência mensal ou maior precisa saber em que dia vence.
    const precisaDia = !["weekly", "biweekly"].includes(d.frequency);
    if (precisaDia && d.dayOfMonth === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayOfMonth"],
        message: "Informe o dia do vencimento",
      });
    }
    if (d.endDate && d.endDate < d.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "O término não pode ser antes do início",
      });
    }
  });

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export async function createRecurring(
  _prev: FixaFormState,
  formData: FormData,
): Promise<FixaFormState> {
  const { ledgerId } = await requireWriteAccess();

  const dia = String(formData.get("dayOfMonth") ?? "").trim();
  const fim = String(formData.get("endDate") ?? "").trim();

  const parsed = schema.safeParse({
    description: formData.get("description"),
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
    frequency: formData.get("frequency"),
    dayOfMonth: dia ? Number(dia) : null,
    startDate: String(formData.get("startDate") ?? ""),
    endDate: fim || null,
    autoConfirm: formData.get("autoConfirm") === "on",
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  // Conta e categoria precisam ser deste espaço, e a categoria do mesmo tipo
  // da regra — senão daria para provisionar despesa em categoria de receita.
  const [conta] = await db
    .select({ id: accounts.id, currency: accounts.currency })
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
        eq(categories.type, d.type),
      ),
    )
    .limit(1);
  if (!cat) return { fieldErrors: { categoryId: "Categoria inválida" } };

  await db.insert(recurringRules).values({
    ledgerId,
    accountId: d.accountId,
    categoryId: d.categoryId,
    type: d.type,
    description: d.description,
    amount: d.amount,
    currency: conta.currency,
    frequency: d.frequency,
    dayOfMonth: d.dayOfMonth,
    startDate: d.startDate,
    endDate: d.endDate,
    autoConfirm: d.autoConfirm,
    active: true,
  });

  // Provisiona já: a pessoa acabou de cadastrar e quer ver as parcelas.
  await provisionarLedger(ledgerId);

  revalidatePath("/contas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/");
  redirect("/contas-fixas");
}

/**
 * Pausa ou reativa. Pausar apaga as parcelas previstas ainda não confirmadas:
 * deixá-las no fluxo diria que um gasto vai acontecer quando ele não vai.
 * Parcelas já confirmadas ficam — elas aconteceram de verdade.
 */
export async function toggleRecurring(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  const [regra] = await db
    .select({ id: recurringRules.id, active: recurringRules.active })
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.ledgerId, ledgerId)))
    .limit(1);

  if (!regra) return;

  const pausando = regra.active;

  await db
    .update(recurringRules)
    .set({
      active: !regra.active,
      // Ao reativar, zerar o marcador faz a provisão recalcular do zero,
      // pulando o que já existe pela trava de idempotência.
      generatedThrough: pausando ? undefined : null,
    })
    .where(and(eq(recurringRules.id, id), eq(recurringRules.ledgerId, ledgerId)));

  if (pausando) {
    await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.recurringRuleId, id),
          eq(transactions.status, "pending"),
        ),
      );
  } else {
    await provisionarLedger(ledgerId);
  }

  revalidatePath("/contas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

export async function deleteRecurring(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  // Só as previstas somem. As confirmadas viram lançamentos avulsos e
  // continuam no histórico: elas aconteceram, independente da regra.
  await db
    .delete(transactions)
    .where(
      and(eq(transactions.recurringRuleId, id), eq(transactions.status, "pending")),
    );

  await db
    .update(transactions)
    .set({ recurringRuleId: null })
    .where(eq(transactions.recurringRuleId, id));

  await db
    .delete(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.ledgerId, ledgerId)));

  revalidatePath("/contas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

/** Confirma um lançamento previsto: ele aconteceu de verdade. */
export async function confirmPending(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  await db
    .update(transactions)
    .set({ status: "cleared" })
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.ledgerId, ledgerId),
        // Só o que está previsto pode ser confirmado; reconfirmar um
        // lançamento já conciliado o rebaixaria de volta.
        eq(transactions.status, "pending"),
      ),
    );

  revalidatePath("/lancamentos");
  revalidatePath("/contas-fixas");
  revalidatePath("/");
}
