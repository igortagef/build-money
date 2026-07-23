"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { assetKinds, assets, assetSnapshots } from "@/db/schema";
import { requireWriteAccess } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { ehInvestimento } from "@/lib/asset-kinds";

export type AssetState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao item").max(120),
  kind: z.enum(["fixed_income", "variable_income", "real_estate", "vehicle", "other"]),
  assetKindId: z.string().uuid().nullish(),
  customKind: z.string().trim().max(60).optional(),
  detail: z.string().trim().max(160).optional(),
  invested: z.number().int().nonnegative(),
  current: z.number().int().nonnegative(),
});

function erros(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export async function createAsset(
  _prev: AssetState,
  formData: FormData,
): Promise<AssetState> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    assetKindId: String(formData.get("assetKindId") ?? "").trim() || undefined,
    customKind: String(formData.get("customKind") ?? "").trim() || undefined,
    detail: String(formData.get("detail") ?? "").trim() || undefined,
    invested: parseMoney(String(formData.get("invested") ?? "")) ?? 0,
    current: parseMoney(String(formData.get("current") ?? "")) ?? 0,
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const investimento = ehInvestimento(d.kind);
  // Para bem físico, "investido" não se aplica: o valor é só o atual.
  const investido = investimento ? d.invested : d.current;
  // O tipo de bem editável só vale para bem; precisa ser deste espaço.
  let assetKindId: string | null = null;
  if (!investimento && d.assetKindId) {
    const [tipo] = await db
      .select({ id: assetKinds.id })
      .from(assetKinds)
      .where(and(eq(assetKinds.id, d.assetKindId), eq(assetKinds.ledgerId, ledgerId)))
      .limit(1);
    assetKindId = tipo?.id ?? null;
  }
  const hoje = new Date().toISOString().slice(0, 10);

  await db.transaction(async (trx) => {
    const [ativo] = await trx
      .insert(assets)
      .values({
        ledgerId,
        name: d.name,
        kind: d.kind,
        assetKindId,
        // O rótulo livre só vale para "outro bem".
        customKind: d.kind === "other" ? (d.customKind ?? null) : null,
        detail: d.detail ?? null,
        investedValue: investido,
        currentValue: d.current,
      })
      .returning({ id: assets.id });

    // Primeiro ponto da evolução: o valor de hoje.
    await trx.insert(assetSnapshots).values({
      assetId: ativo.id,
      value: d.current,
      date: hoje,
    });
  });

  revalidatePath("/patrimonio");
  revalidatePath("/bens");
  revalidatePath("/");
  redirect("/patrimonio");
}

const atualizarSchema = z.object({
  id: z.string().uuid(),
  current: z.number().int().nonnegative(),
});

/**
 * Atualiza o valor atual de um item e grava um snapshot na data de hoje.
 * O snapshot é o que alimenta a evolução mensal.
 */
export async function updateAssetValue(
  _prev: AssetState,
  formData: FormData,
): Promise<AssetState> {
  const { ledgerId } = await requireWriteAccess();

  const parsed = atualizarSchema.safeParse({
    id: formData.get("id"),
    current: parseMoney(String(formData.get("current") ?? "")) ?? 0,
  });
  if (!parsed.success) return { error: "Valor inválido." };

  const [ativo] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, parsed.data.id), eq(assets.ledgerId, ledgerId)))
    .limit(1);
  if (!ativo) return { error: "Item não encontrado." };

  const hoje = new Date().toISOString().slice(0, 10);

  await db.transaction(async (trx) => {
    await trx
      .update(assets)
      .set({ currentValue: parsed.data.current, updatedAt: new Date() })
      .where(eq(assets.id, parsed.data.id));

    // Um snapshot por dia: reajustar o valor no mesmo dia sobrescreve, em vez
    // de acumular pontos duplicados na evolução.
    const existente = await trx
      .select({ id: assetSnapshots.id })
      .from(assetSnapshots)
      .where(and(eq(assetSnapshots.assetId, parsed.data.id), eq(assetSnapshots.date, hoje)))
      .limit(1);

    if (existente[0]) {
      await trx
        .update(assetSnapshots)
        .set({ value: parsed.data.current })
        .where(eq(assetSnapshots.id, existente[0].id));
    } else {
      await trx.insert(assetSnapshots).values({
        assetId: parsed.data.id,
        value: parsed.data.current,
        date: hoje,
      });
    }
  });

  revalidatePath("/patrimonio");
  revalidatePath("/bens");
  revalidatePath("/");
  return {};
}

export async function deleteAsset(formData: FormData) {
  const { ledgerId } = await requireWriteAccess();
  const id = String(formData.get("id") ?? "");

  // Snapshots somem por cascade.
  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.ledgerId, ledgerId)));

  revalidatePath("/patrimonio");
  revalidatePath("/bens");
  revalidatePath("/");
}
