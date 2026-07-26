"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { aoCadastrarConta, semQuebrar } from "@/lib/gamification";
import type { CurrencyCode } from "@/db/schema";

/**
 * Criação rápida de conta e categoria a partir da tela de lançamento.
 *
 * Estas ações são chamadas de dentro do formulário de lançamento, então NÃO
 * podem redirecionar nem descartar o que o usuário já digitou: elas devolvem
 * o registro criado e a tela apenas o adiciona à lista e o seleciona.
 */

export type QuickResult<T> =
  | { ok: true; item: T }
  | { ok: false; erro: string };

export type ContaCriada = {
  id: string;
  name: string;
  currency: CurrencyCode;
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

const contaSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à conta").max(80),
  type: z.enum(["checking", "savings", "credit_card", "cash", "investment"]),
  currency: z.enum(["BRL", "USD", "EUR"]),
});

export async function criarContaRapida(
  entrada: unknown,
): Promise<QuickResult<ContaCriada>> {
  // Server Action é endpoint POST público: a checagem vem antes de tudo.
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = contaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message };
  }

  const [conta] = await db
    .insert(accounts)
    .values({
      ledgerId,
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      openingBalance: 0,
      openingBalanceDate: new Date().toISOString().slice(0, 10),
    })
    .returning({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      type: accounts.type,
      statementClosingDay: accounts.statementClosingDay,
      paymentDueDay: accounts.paymentDueDay,
    });

  await semQuebrar(() => aoCadastrarConta(userId, ledgerId));

  revalidatePath("/contas");
  revalidatePath("/");
  return { ok: true, item: conta };
}

export type CategoriaCriada = {
  id: string;
  label: string;
  type: "income" | "expense";
};

const categoriaSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à categoria").max(60),
  type: z.enum(["income", "expense"]),
  // Vazio = categoria de primeiro nível.
  parentId: z.string().uuid().nullable(),
});

export async function criarCategoriaRapida(
  entrada: unknown,
): Promise<QuickResult<CategoriaCriada>> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = categoriaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0].message };
  }

  const { name, type, parentId } = parsed.data;

  let nomePai: string | null = null;

  if (parentId) {
    // O pai precisa ser deste espaço E do mesmo tipo — senão daria para
    // pendurar uma subcategoria de despesa dentro de um grupo de receita.
    const [pai] = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.id, parentId),
          eq(categories.ledgerId, ledgerId),
          eq(categories.type, type),
          isNull(categories.parentId),
        ),
      )
      .limit(1);

    if (!pai) return { ok: false, erro: "Grupo inválido." };
    nomePai = pai.name;
  }

  // O índice único (ledger, tipo, nome, pai) rejeitaria a duplicata com um
  // erro cru do banco; avisar antes é mais útil.
  const [existente] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, type),
        eq(categories.name, name),
        parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId),
      ),
    )
    .limit(1);

  if (existente) {
    return { ok: false, erro: "Já existe uma categoria com esse nome aqui." };
  }

  const [cat] = await db
    .insert(categories)
    .values({
      ledgerId,
      type,
      name,
      parentId,
      // Herda o centro de custo do grupo, como faz o plano padrão.
      costCenterId: parentId
        ? (
            await db
              .select({ cc: categories.costCenterId })
              .from(categories)
              .where(eq(categories.id, parentId))
              .limit(1)
          )[0]?.cc ?? null
        : null,
      isDefault: false,
      sortOrder: 999,
    })
    .returning({ id: categories.id, name: categories.name, type: categories.type });

  revalidatePath("/categorias");
  revalidatePath("/orcamento");

  return {
    ok: true,
    item: {
      id: cat.id,
      type: cat.type,
      label: nomePai ? `${nomePai} › ${cat.name}` : cat.name,
    },
  };
}

/** Grupos (categorias de primeiro nível) para escolher o pai na criação rápida. */
export async function listarGrupos(tipo: "income" | "expense") {
  const { ledgerId } = await requireWriteAccess();

  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, tipo),
        isNull(categories.parentId),
        isNull(categories.archivedAt),
      ),
    )
    .orderBy(categories.sortOrder);
}
