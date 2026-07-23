"use server";

import { z } from "zod";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories, costCenters, transactionSplits } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";

export type CatResult = { ok: true } | { ok: false; erro: string };

function revalidar() {
  revalidatePath("/categorias");
  revalidatePath("/orcamento");
  revalidatePath("/lancamentos");
  revalidatePath("/");
}

/**
 * Confere que a categoria é deste espaço antes de qualquer alteração.
 * Server Actions são endpoints POST públicos: sem isso, qualquer um poderia
 * renomear categoria alheia mandando um id.
 */
async function daminha(ledgerId: string, id: string) {
  const [cat] = await db
    .select({
      id: categories.id,
      type: categories.type,
      parentId: categories.parentId,
      name: categories.name,
    })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)))
    .limit(1);
  return cat ?? null;
}

const criarSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à categoria").max(60),
  type: z.enum(["income", "expense"]),
  parentId: z.string().uuid().nullable(),
  costCenterId: z.string().uuid().nullable(),
});

export async function criarCategoria(entrada: unknown): Promise<CatResult> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = criarSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

  const { name, type, parentId, costCenterId } = parsed.data;

  if (parentId) {
    const pai = await daminha(ledgerId, parentId);
    // Subcategoria de despesa dentro de grupo de receita seria um lançamento
    // impossível; e não permitimos mais de dois níveis.
    if (!pai || pai.type !== type || pai.parentId) {
      return { ok: false, erro: "Grupo inválido." };
    }
  }

  const [dup] = await db
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

  if (dup) return { ok: false, erro: "Já existe uma categoria com esse nome aqui." };

  // Sem centro escolhido, a subcategoria herda o do grupo.
  let cc = costCenterId;
  if (!cc && parentId) {
    const [pai] = await db
      .select({ cc: categories.costCenterId })
      .from(categories)
      .where(eq(categories.id, parentId))
      .limit(1);
    cc = pai?.cc ?? null;
  }

  await db.insert(categories).values({
    ledgerId,
    type,
    name,
    parentId,
    costCenterId: cc,
    isDefault: false,
    sortOrder: 999,
  });

  revalidar();
  return { ok: true };
}

const renomearSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "O nome não pode ficar vazio").max(60),
});

export async function renomearCategoria(entrada: unknown): Promise<CatResult> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = renomearSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

  const cat = await daminha(ledgerId, parsed.data.id);
  if (!cat) return { ok: false, erro: "Categoria não encontrada." };

  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ledgerId, ledgerId),
        eq(categories.type, cat.type),
        eq(categories.name, parsed.data.name),
        cat.parentId
          ? eq(categories.parentId, cat.parentId)
          : isNull(categories.parentId),
        ne(categories.id, cat.id),
      ),
    )
    .limit(1);

  if (dup) return { ok: false, erro: "Já existe uma categoria com esse nome aqui." };

  // Renomear preserva o id, então o histórico continua ligado: os lançamentos
  // antigos passam a exibir o nome novo, que é o comportamento esperado.
  await db
    .update(categories)
    .set({ name: parsed.data.name })
    .where(and(eq(categories.id, cat.id), eq(categories.ledgerId, ledgerId)));

  revalidar();
  return { ok: true };
}

export async function definirCentroDeCusto(
  id: string,
  costCenterId: string | null,
): Promise<CatResult> {
  const { ledgerId } = await requireWriteAccess();

  const cat = await daminha(ledgerId, id);
  if (!cat) return { ok: false, erro: "Categoria não encontrada." };

  if (costCenterId) {
    const [cc] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(
        and(eq(costCenters.id, costCenterId), eq(costCenters.ledgerId, ledgerId)),
      )
      .limit(1);
    if (!cc) return { ok: false, erro: "Centro de custo inválido." };
  }

  await db
    .update(categories)
    .set({ costCenterId })
    .where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));

  // Mudar o centro do grupo arrasta as subcategorias que seguiam o antigo —
  // é o que o usuário espera ao reorganizar, e evita filhos órfãos.
  if (!cat.parentId) {
    await db
      .update(categories)
      .set({ costCenterId })
      .where(
        and(eq(categories.parentId, id), eq(categories.ledgerId, ledgerId)),
      );
  }

  revalidar();
  return { ok: true };
}

/** Quantos lançamentos usam a categoria (ou suas subcategorias). */
async function usos(ledgerId: string, id: string): Promise<number> {
  const filhos = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, id), eq(categories.ledgerId, ledgerId)));

  const ids = [id, ...filhos.map((f) => f.id)];

  const [r] = await db
    .select({ n: count() })
    .from(transactionSplits)
    .where(inArray(transactionSplits.categoryId, ids));

  return r?.n ?? 0;
}

export async function arquivarCategoria(
  id: string,
  arquivar: boolean,
): Promise<CatResult> {
  const { ledgerId } = await requireWriteAccess();

  const cat = await daminha(ledgerId, id);
  if (!cat) return { ok: false, erro: "Categoria não encontrada." };

  const quando = arquivar ? new Date() : null;

  await db
    .update(categories)
    .set({ archivedAt: quando })
    .where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));

  // Arquivar um grupo esconde as subcategorias junto: deixá-las visíveis sob
  // um grupo arquivado produziria opções soltas na tela de lançamento.
  if (!cat.parentId) {
    await db
      .update(categories)
      .set({ archivedAt: quando })
      .where(
        and(eq(categories.parentId, id), eq(categories.ledgerId, ledgerId)),
      );
  }

  revalidar();
  return { ok: true };
}

/**
 * Apaga de vez — só quando a categoria nunca foi usada.
 *
 * Com lançamentos, o banco recusaria (a chave estrangeira é `restrict`), e é
 * assim de propósito: apagar uma categoria em uso arrastaria o histórico
 * junto. Nesse caso o caminho é arquivar.
 */
export async function apagarCategoria(id: string): Promise<CatResult> {
  const { ledgerId } = await requireWriteAccess();

  const cat = await daminha(ledgerId, id);
  if (!cat) return { ok: false, erro: "Categoria não encontrada." };

  const n = await usos(ledgerId, id);
  if (n > 0) {
    return {
      ok: false,
      erro: `Esta categoria já tem ${n} ${n === 1 ? "lançamento" : "lançamentos"}. Arquive em vez de apagar, para não perder o histórico.`,
    };
  }

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.ledgerId, ledgerId)));

  revalidar();
  return { ok: true };
}
