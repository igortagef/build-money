"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { assetKinds, assets } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";

export type TipoBemResultado = { ok: true } | { ok: false; erro: string };

const nomeSchema = z.string().trim().min(1, "Dê um nome ao tipo").max(60);

function revalidar() {
  revalidatePath("/bens");
  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio/novo");
}

/** Cria um novo tipo de bem (ex.: "Joias", "Terreno"). */
export async function criarTipoBem(nome: string): Promise<TipoBemResultado> {
  const { ledgerId } = await requireWriteAccess();
  const parsed = nomeSchema.safeParse(nome);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

  // Não repetir um nome que já existe (ativo) neste espaço.
  const [existe] = await db
    .select({ id: assetKinds.id })
    .from(assetKinds)
    .where(
      and(
        eq(assetKinds.ledgerId, ledgerId),
        sql`lower(${assetKinds.name}) = lower(${parsed.data})`,
        sql`${assetKinds.archivedAt} is null`,
      ),
    )
    .limit(1);
  if (existe) return { ok: false, erro: "Já existe um tipo com esse nome." };

  const [max] = await db
    .select({ v: sql<number>`coalesce(max(${assetKinds.sortOrder}), 0)`.mapWith(Number) })
    .from(assetKinds)
    .where(eq(assetKinds.ledgerId, ledgerId));

  await db.insert(assetKinds).values({
    ledgerId,
    name: parsed.data,
    sortOrder: (max?.v ?? 0) + 1,
  });

  revalidar();
  return { ok: true };
}

const renomearSchema = z.object({ id: z.string().uuid(), name: nomeSchema });

export async function renomearTipoBem(entrada: {
  id: string;
  name: string;
}): Promise<TipoBemResultado> {
  const { ledgerId } = await requireWriteAccess();
  const parsed = renomearSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: parsed.error.issues[0].message };

  const r = await db
    .update(assetKinds)
    .set({ name: parsed.data.name })
    .where(and(eq(assetKinds.id, parsed.data.id), eq(assetKinds.ledgerId, ledgerId)))
    .returning({ id: assetKinds.id });
  if (r.length === 0) return { ok: false, erro: "Tipo não encontrado." };

  revalidar();
  return { ok: true };
}

export async function arquivarTipoBem(
  id: string,
  arquivar: boolean,
): Promise<TipoBemResultado> {
  const { ledgerId } = await requireWriteAccess();
  const r = await db
    .update(assetKinds)
    .set({ archivedAt: arquivar ? new Date() : null })
    .where(and(eq(assetKinds.id, id), eq(assetKinds.ledgerId, ledgerId)))
    .returning({ id: assetKinds.id });
  if (r.length === 0) return { ok: false, erro: "Tipo não encontrado." };

  revalidar();
  return { ok: true };
}

/** Apaga um tipo — só se nenhum bem o usa (senão o histórico perderia o rótulo). */
export async function apagarTipoBem(id: string): Promise<TipoBemResultado> {
  const { ledgerId } = await requireWriteAccess();

  const [uso] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(assets)
    .where(and(eq(assets.assetKindId, id), eq(assets.ledgerId, ledgerId)));
  if ((uso?.n ?? 0) > 0) {
    return { ok: false, erro: "Este tipo está em uso. Arquive em vez de apagar." };
  }

  await db
    .delete(assetKinds)
    .where(and(eq(assetKinds.id, id), eq(assetKinds.ledgerId, ledgerId)));

  revalidar();
  return { ok: true };
}
