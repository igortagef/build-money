"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { goals, goalContributions } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { getGuardado } from "@/lib/goals";
import { aoMexerEmMeta, semQuebrar } from "@/lib/gamification";

export type MetaFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const metaSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome à meta").max(80),
    description: z.string().trim().max(300).optional(),
    targetAmount: z.number().int().positive("O valor da meta precisa ser maior que zero"),
    currency: z.enum(["BRL", "USD", "EUR"]),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    aporteInicial: z.number().int().nonnegative(),
  })
  .superRefine((d, ctx) => {
    if (d.targetDate && d.targetDate < new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDate"],
        message: "A data alvo precisa estar no futuro",
      });
    }
    if (d.aporteInicial > d.targetAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aporteInicial"],
        message: "O valor já guardado não pode ser maior que a meta",
      });
    }
  });

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export async function createGoal(
  _prev: MetaFormState,
  formData: FormData,
): Promise<MetaFormState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = metaSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    targetAmount: parseMoney(String(formData.get("targetAmount") ?? "")) ?? 0,
    currency: formData.get("currency"),
    targetDate: String(formData.get("targetDate") ?? "") || null,
    aporteInicial: parseMoney(String(formData.get("aporteInicial") ?? "")) ?? 0,
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };

  const d = parsed.data;
  const hoje = new Date().toISOString().slice(0, 10);

  const [meta] = await db
    .insert(goals)
    .values({
      ledgerId,
      name: d.name,
      description: d.description ?? null,
      targetAmount: d.targetAmount,
      currency: d.currency,
      targetDate: d.targetDate,
      startDate: hoje,
    })
    .returning({ id: goals.id });

  // Quem já tem dinheiro guardado começa a meta com ele, não do zero.
  if (d.aporteInicial > 0) {
    await db.insert(goalContributions).values({
      goalId: meta.id,
      amount: d.aporteInicial,
      date: hoje,
    });
  }

  const jaAtingiu = d.aporteInicial >= d.targetAmount;
  await semQuebrar(() => aoMexerEmMeta(userId, ledgerId, meta.id, jaAtingiu));

  if (jaAtingiu) {
    await db
      .update(goals)
      .set({ status: "achieved", achievedAt: new Date() })
      .where(eq(goals.id, meta.id));
  }

  revalidatePath("/metas");
  revalidatePath("/conquistas");
  redirect("/metas");
}

const editSchema = z.object({
  goalId: z.string().uuid(),
  name: z.string().trim().min(1, "Dê um nome à meta").max(80),
  description: z.string().trim().max(300).optional(),
  targetAmount: z.number().int().positive("O valor da meta precisa ser maior que zero"),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/**
 * Edita os dados de uma meta (nome, descrição, valor alvo, data alvo). Não mexe
 * nos aportes — o histórico do que já foi guardado é intocado. A moeda também
 * não muda aqui: como os aportes são guardados na moeda da meta, trocá-la
 * reinterpretaria valores já lançados.
 *
 * Ao mudar o valor alvo, o status se ajusta: baixou abaixo do que já há guardado
 * → atingida; subiu acima → volta a ativa.
 */
export async function editGoal(
  _prev: MetaFormState,
  formData: FormData,
): Promise<MetaFormState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = editSchema.safeParse({
    goalId: formData.get("goalId"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    targetAmount: parseMoney(String(formData.get("targetAmount") ?? "")) ?? 0,
    targetDate: String(formData.get("targetDate") ?? "") || null,
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const [meta] = await db
    .select({ id: goals.id, status: goals.status })
    .from(goals)
    .where(and(eq(goals.id, d.goalId), eq(goals.ledgerId, ledgerId)))
    .limit(1);
  if (!meta) return { error: "Meta não encontrada." };

  await db
    .update(goals)
    .set({
      name: d.name,
      description: d.description ?? null,
      targetAmount: d.targetAmount,
      targetDate: d.targetDate,
    })
    .where(eq(goals.id, d.goalId));

  // Reavalia o status contra o novo alvo, do banco (aportes podem ter mudado).
  const guardado = await getGuardado(d.goalId);
  if (guardado >= d.targetAmount && meta.status !== "achieved") {
    await db
      .update(goals)
      .set({ status: "achieved", achievedAt: new Date() })
      .where(eq(goals.id, d.goalId));
    await semQuebrar(() => aoMexerEmMeta(userId, ledgerId, d.goalId, true));
  } else if (guardado < d.targetAmount && meta.status === "achieved") {
    await db
      .update(goals)
      .set({ status: "active", achievedAt: null })
      .where(eq(goals.id, d.goalId));
  }

  revalidatePath("/metas");
  revalidatePath("/conquistas");
  redirect("/metas");
}

const aporteSchema = z.object({
  goalId: z.string().uuid(),
  amount: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function addContribution(
  _prev: MetaFormState,
  formData: FormData,
): Promise<MetaFormState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = aporteSchema.safeParse({
    goalId: formData.get("goalId"),
    amount: parseMoney(String(formData.get("amount") ?? "")) ?? 0,
    date: String(formData.get("date") ?? ""),
  });

  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  if (parsed.data.amount === 0) {
    return { fieldErrors: { amount: "Informe um valor" } };
  }

  // A meta precisa ser deste espaço — a ação é um endpoint POST público.
  const [meta] = await db
    .select({ id: goals.id, target: goals.targetAmount, status: goals.status })
    .from(goals)
    .where(and(eq(goals.id, parsed.data.goalId), eq(goals.ledgerId, ledgerId)))
    .limit(1);

  if (!meta) return { error: "Meta não encontrada." };

  await db.insert(goalContributions).values({
    goalId: meta.id,
    amount: parsed.data.amount,
    date: parsed.data.date,
  });

  // Recalcula do banco, e não do valor enviado: aportes podem ter vindo de
  // outro dispositivo ou de outra pessoa no espaço compartilhado.
  const guardado = await getGuardado(meta.id);
  const atingiuAgora = guardado >= meta.target && meta.status !== "achieved";

  if (atingiuAgora) {
    await db
      .update(goals)
      .set({ status: "achieved", achievedAt: new Date() })
      .where(eq(goals.id, meta.id));
    await semQuebrar(() => aoMexerEmMeta(userId, ledgerId, meta.id, true));
  }

  // Guardou a mais e depois tirou? A meta volta a ficar ativa.
  if (!atingiuAgora && guardado < meta.target && meta.status === "achieved") {
    await db
      .update(goals)
      .set({ status: "active", achievedAt: null })
      .where(eq(goals.id, meta.id));
  }

  revalidatePath("/metas");
  revalidatePath("/conquistas");
  return {};
}

export async function deleteGoal(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.ledgerId, ledgerId)));

  revalidatePath("/metas");
}
