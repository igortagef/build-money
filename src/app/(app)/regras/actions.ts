"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { REGRAS_SUGERIDAS, normalizar } from "@/lib/regras-sugeridas";

export type RegraState = { erro?: string };

export async function criarRegra(_prev: RegraState, formData: FormData): Promise<RegraState> {
  const { ledgerId } = await requireWriteAccess();
  const pattern = String(formData.get("pattern") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");

  if (pattern.length < 2) return { erro: "O texto a reconhecer precisa de ao menos 2 letras." };
  if (!categoryId) return { erro: "Escolha a categoria." };

  // A categoria precisa ser deste espaço.
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.ledgerId, ledgerId)))
    .limit(1);
  if (!cat) return { erro: "Categoria inválida." };

  await db.insert(categoryRules).values({ ledgerId, pattern, categoryId });
  revalidatePath("/regras");
  return {};
}

/**
 * Cria as regras sugeridas (universais) que ainda não existem. Cada sugestão só
 * entra se a categoria-folha correspondente existir no plano do usuário — quem
 * renomeou/apagou a categoria simplesmente não recebe aquela regra.
 */
export async function aplicarSugestoes(): Promise<void> {
  const { ledgerId } = await requireWriteAccess();

  const [cats, jaExistem] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.ledgerId, ledgerId), eq(categories.type, "expense"))),
    db
      .select({ pattern: categoryRules.pattern })
      .from(categoryRules)
      .where(eq(categoryRules.ledgerId, ledgerId)),
  ]);

  const porNome = new Map(cats.map((c) => [normalizar(c.name), c.id]));
  const usados = new Set(jaExistem.map((r) => normalizar(r.pattern)));

  const novas = REGRAS_SUGERIDAS.flatMap((s) => {
    if (usados.has(normalizar(s.pattern))) return [];
    const categoryId = porNome.get(normalizar(s.categoria));
    if (!categoryId) return [];
    return [{ ledgerId, pattern: s.pattern, categoryId }];
  });

  if (novas.length > 0) await db.insert(categoryRules).values(novas);
  revalidatePath("/regras");
}

export async function apagarRegra(formData: FormData): Promise<void> {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");
  await db
    .delete(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.ledgerId, ledgerId)));
  revalidatePath("/regras");
}
