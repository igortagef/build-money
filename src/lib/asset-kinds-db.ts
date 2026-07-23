import "server-only";
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { assetKinds, assets } from "@/db/schema";

/** Tipos de bem padrão de um espaço novo (ou recém-migrado). */
export const TIPOS_BEM_PADRAO = ["Imóvel", "Veículo", "Outro"];

/**
 * Garante que o espaço tenha ao menos os tipos padrão. Espaços criados antes da
 * lista editável não têm nenhum; em vez de uma migração de dados, semeamos sob
 * demanda na primeira vez que a lista é usada. Idempotente: só insere se vazio.
 */
export async function garantirTiposBem(ledgerId: string) {
  const existentes = await db
    .select({ id: assetKinds.id })
    .from(assetKinds)
    .where(eq(assetKinds.ledgerId, ledgerId))
    .limit(1);
  if (existentes.length > 0) return;

  await db
    .insert(assetKinds)
    .values(
      TIPOS_BEM_PADRAO.map((name, i) => ({ ledgerId, name, sortOrder: i })),
    )
    .onConflictDoNothing();
}

/** Lista os tipos de bem, com quantos bens usam cada um. */
export async function getTiposBem(ledgerId: string) {
  await garantirTiposBem(ledgerId);

  // Contagem de uso numa consulta agrupada à parte — uma subquery correlacionada
  // no SELECT não correlacionava direito e vinha sempre zero.
  const [tipos, usos] = await Promise.all([
    db
      .select({
        id: assetKinds.id,
        name: assetKinds.name,
        arquivado: sql<boolean>`${assetKinds.archivedAt} is not null`,
      })
      .from(assetKinds)
      .where(eq(assetKinds.ledgerId, ledgerId))
      .orderBy(asc(assetKinds.archivedAt), asc(assetKinds.sortOrder), asc(assetKinds.name)),
    db
      .select({ kindId: assets.assetKindId, n: count() })
      .from(assets)
      .where(and(eq(assets.ledgerId, ledgerId), isNotNull(assets.assetKindId)))
      .groupBy(assets.assetKindId),
  ]);

  const usoPorTipo = new Map(usos.map((u) => [u.kindId, u.n]));
  return tipos.map((t) => ({ ...t, usos: usoPorTipo.get(t.id) ?? 0 }));
}

/** Só os tipos ativos, para preencher o seletor do cadastro de bem. */
export async function getTiposBemAtivos(ledgerId: string) {
  await garantirTiposBem(ledgerId);
  return db
    .select({ id: assetKinds.id, name: assetKinds.name })
    .from(assetKinds)
    .where(and(eq(assetKinds.ledgerId, ledgerId), isNull(assetKinds.archivedAt)))
    .orderBy(asc(assetKinds.sortOrder), asc(assetKinds.name));
}
