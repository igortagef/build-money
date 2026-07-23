"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";

export type OrcamentoState = { error?: string; ok?: boolean };

const schema = z.object({
  categoryId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().nonnegative(),
});

/**
 * Define (ou zera) o orçamento de uma categoria no mês.
 * Valor zero remove o orçamento em vez de gravar um limite de R$ 0,00 —
 * que na prática significaria "estourado desde o primeiro centavo".
 */
export async function setBudget(
  _prev: OrcamentoState,
  formData: FormData,
): Promise<OrcamentoState> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = schema.safeParse({
    categoryId: formData.get("categoryId"),
    month: formData.get("month"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
  });

  if (!parsed.success) return { error: "Dados inválidos." };
  const { categoryId, month, amount } = parsed.data;

  // A categoria precisa ser deste espaço e ser de despesa.
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, "expense"),
      ),
    )
    .limit(1);

  if (!cat) return { error: "Categoria inválida." };

  if (amount === 0) {
    await db
      .delete(budgets)
      .where(
        and(
          eq(budgets.ledgerId, ledgerId),
          eq(budgets.categoryId, categoryId),
          eq(budgets.month, month),
        ),
      );
  } else {
    await db
      .insert(budgets)
      .values({ ledgerId, categoryId, month, amount, rollsOver: true })
      .onConflictDoUpdate({
        target: [budgets.ledgerId, budgets.month, budgets.categoryId],
        set: { amount },
      });
  }

  revalidatePath("/orcamento");
  revalidatePath("/");
  return { ok: true };
}
