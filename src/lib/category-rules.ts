import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";

/**
 * Regras de categorização automática. A checagem é simples e previsível (sem
 * IA): a descrição, em minúsculas, CONTÉM o padrão. Regras mais específicas
 * (padrão mais longo) vencem — "uber eats" antes de "uber".
 */
export type RegraParaCasar = { id: string; pattern: string; categoryId: string };

/** Casa uma descrição contra regras já carregadas (para usar em laços de import). */
export function casarPorRegras(regras: RegraParaCasar[], description: string): string | null {
  const alvo = description.toLowerCase();
  // Já vêm ordenadas por padrão mais longo primeiro.
  for (const r of regras) {
    if (r.pattern && alvo.includes(r.pattern.toLowerCase())) return r.categoryId;
  }
  return null;
}

/** Regras do espaço, prontas para casar (padrão mais específico primeiro). */
export async function getRegrasParaCasar(ledgerId: string): Promise<RegraParaCasar[]> {
  const rows = await db
    .select({ id: categoryRules.id, pattern: categoryRules.pattern, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .where(eq(categoryRules.ledgerId, ledgerId));
  return rows.sort((a, b) => b.pattern.length - a.pattern.length);
}

/** Regras com o rótulo da categoria (Pai › Filha), para a tela de gestão. */
export async function getRegras(ledgerId: string) {
  const pai = alias(categories, "pai");
  const rows = await db
    .select({
      id: categoryRules.id,
      pattern: categoryRules.pattern,
      categoryId: categoryRules.categoryId,
      nome: categories.name,
      paiNome: pai.name,
    })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .leftJoin(pai, eq(pai.id, categories.parentId))
    .where(eq(categoryRules.ledgerId, ledgerId))
    .orderBy(desc(categoryRules.createdAt));

  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    categoryId: r.categoryId,
    rotulo: r.paiNome ? `${r.paiNome} › ${r.nome}` : r.nome,
  }));
}

/** Categorias de despesa/receita (folhas) para o seletor da regra. */
export async function getCategoriasParaRegra(ledgerId: string) {
  const pai = alias(categories, "pai");
  const rows = await db
    .select({
      id: categories.id,
      nome: categories.name,
      paiNome: pai.name,
      parentId: categories.parentId,
      tipo: categories.type,
    })
    .from(categories)
    .leftJoin(pai, eq(pai.id, categories.parentId))
    .where(and(eq(categories.ledgerId, ledgerId), isNull(categories.archivedAt)))
    .orderBy(categories.sortOrder, categories.name);

  return rows
    .map((c) => ({
      id: c.id,
      tipo: c.tipo,
      label: c.paiNome ? `${c.paiNome} › ${c.nome}` : c.nome,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
