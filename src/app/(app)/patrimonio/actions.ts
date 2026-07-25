"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  accounts,
  assetKinds,
  assets,
  assetSnapshots,
  goals,
  goalContributions,
  transactions,
} from "@/db/schema";
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

/** Encontra (ou cria) a conta-destino única dos aportes de investimento. */
async function garantirContaInvestimentos(
  trx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ledgerId: string,
  currency: "BRL" | "USD" | "EUR",
) {
  const [existente] = await trx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ledgerId, ledgerId), eq(accounts.isInvestmentPool, true)))
    .limit(1);
  if (existente) return existente.id;

  const [criada] = await trx
    .insert(accounts)
    .values({
      ledgerId,
      name: "Investimentos",
      type: "investment",
      currency,
      openingBalance: 0,
      openingBalanceDate: new Date().toISOString().slice(0, 10),
      isInvestmentPool: true,
      // Fora do net worth: o valor do investimento já vem do patrimônio (asset).
      includeInNetWorth: false,
    })
    .returning({ id: accounts.id });
  return criada.id;
}

const aporteSchema = z.object({
  assetId: z.string().uuid(),
  contaOrigemId: z.string().uuid("Escolha a conta de onde saiu o dinheiro"),
  valor: z.number().int().positive("Informe um valor maior que zero"),
  metaId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

/**
 * Aporte num investimento: cria uma TRANSFERÊNCIA da conta de origem para a
 * conta "Investimentos" (conciliável com o extrato), aumenta o valor aportado
 * do ativo e, se uma meta foi escolhida, avança a meta com o mesmo dinheiro
 * (sem contar duas vezes). A transferência nasce "cleared" (realizada) para
 * aparecer na conciliação e ser conferida ao bater com o extrato.
 */
export async function aportarInvestimento(
  _prev: AssetState,
  formData: FormData,
): Promise<AssetState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = aporteSchema.safeParse({
    assetId: formData.get("assetId"),
    contaOrigemId: formData.get("contaOrigemId"),
    valor: parseMoney(String(formData.get("valor") ?? "")) ?? 0,
    metaId: String(formData.get("metaId") ?? "") || null,
    date: String(formData.get("date") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const [ativo] = await db
    .select({
      id: assets.id,
      name: assets.name,
      kind: assets.kind,
      invested: assets.investedValue,
      current: assets.currentValue,
    })
    .from(assets)
    .where(and(eq(assets.id, d.assetId), eq(assets.ledgerId, ledgerId)))
    .limit(1);
  if (!ativo || !ehInvestimento(ativo.kind)) return { error: "Investimento não encontrado." };

  const [origem] = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, d.contaOrigemId),
        eq(accounts.ledgerId, ledgerId),
        eq(accounts.isReimbursementPool, false),
        eq(accounts.isInvestmentPool, false),
      ),
    )
    .limit(1);
  if (!origem) return { fieldErrors: { contaOrigemId: "Conta inválida" } };

  let meta: { id: string; target: number; status: string } | null = null;
  if (d.metaId) {
    const [m] = await db
      .select({ id: goals.id, target: goals.targetAmount, status: goals.status })
      .from(goals)
      .where(and(eq(goals.id, d.metaId), eq(goals.ledgerId, ledgerId)))
      .limit(1);
    if (!m) return { fieldErrors: { metaId: "Meta inválida" } };
    meta = m;
  }

  await db.transaction(async (trx) => {
    const investimentosId = await garantirContaInvestimentos(trx, ledgerId, origem.currency);
    const par = crypto.randomUUID();
    const descricao = `Aporte: ${ativo.name}`;

    await trx.insert(transactions).values([
      {
        ledgerId, accountId: origem.id, createdByUserId: userId, type: "transfer",
        status: "cleared", amount: -d.valor, currency: origem.currency, amountBase: -d.valor,
        description: descricao, date: d.date, settlementDate: d.date, transferPairId: par,
      },
      {
        ledgerId, accountId: investimentosId, createdByUserId: userId, type: "transfer",
        status: "cleared", amount: d.valor, currency: origem.currency, amountBase: d.valor,
        description: descricao, date: d.date, settlementDate: d.date, transferPairId: par,
      },
    ]);

    // Mais dinheiro aportado; o valor atual sobe pelo custo do aporte.
    const novoAtual = ativo.current + d.valor;
    await trx
      .update(assets)
      .set({ investedValue: ativo.invested + d.valor, currentValue: novoAtual, updatedAt: new Date() })
      .where(eq(assets.id, ativo.id));

    // Snapshot do dia (um por dia; reaportar no mesmo dia sobrescreve).
    const [snap] = await trx
      .select({ id: assetSnapshots.id })
      .from(assetSnapshots)
      .where(and(eq(assetSnapshots.assetId, ativo.id), eq(assetSnapshots.date, d.date)))
      .limit(1);
    if (snap) {
      await trx.update(assetSnapshots).set({ value: novoAtual }).where(eq(assetSnapshots.id, snap.id));
    } else {
      await trx.insert(assetSnapshots).values({ assetId: ativo.id, value: novoAtual, date: d.date });
    }

    // Meta opcional: o mesmo dinheiro avança a meta.
    if (meta) {
      await trx.insert(goalContributions).values({ goalId: meta.id, amount: d.valor, date: d.date });
      const [{ soma }] = await trx
        .select({ soma: sql<number>`coalesce(sum(${goalContributions.amount}), 0)`.mapWith(Number) })
        .from(goalContributions)
        .where(eq(goalContributions.goalId, meta.id));
      if (soma >= meta.target && meta.status !== "achieved") {
        await trx.update(goals).set({ status: "achieved", achievedAt: new Date() }).where(eq(goals.id, meta.id));
      }
    }
  });

  revalidatePath("/patrimonio");
  revalidatePath("/conciliacao");
  revalidatePath("/metas");
  revalidatePath("/");
  return {};
}

const resgateSchema = z.object({
  assetId: z.string().uuid(),
  contaDestinoId: z.string().uuid("Escolha a conta que recebeu o dinheiro"),
  valor: z.number().int().positive("Informe um valor maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

/**
 * Resgate de um investimento — o inverso do aporte. Cria uma TRANSFERÊNCIA da
 * conta "Investimentos" para a conta escolhida (conciliável com o extrato),
 * baixa o valor de mercado do ativo (currentValue) e reduz a base aportada
 * (investedValue) na MESMA proporção resgatada, para o rendimento do que sobra
 * continuar coerente (resgate parcial realiza ganho proporcional). O patrimônio
 * não muda: o que era investimento vira caixa.
 */
export async function resgatarInvestimento(
  _prev: AssetState,
  formData: FormData,
): Promise<AssetState> {
  const { ledgerId, userId } = await requireWriteAccess();

  const parsed = resgateSchema.safeParse({
    assetId: formData.get("assetId"),
    contaDestinoId: formData.get("contaDestinoId"),
    valor: parseMoney(String(formData.get("valor") ?? "")) ?? 0,
    date: String(formData.get("date") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: erros(parsed.error) };
  const d = parsed.data;

  const [ativo] = await db
    .select({
      id: assets.id,
      name: assets.name,
      kind: assets.kind,
      invested: assets.investedValue,
      current: assets.currentValue,
    })
    .from(assets)
    .where(and(eq(assets.id, d.assetId), eq(assets.ledgerId, ledgerId)))
    .limit(1);
  if (!ativo || !ehInvestimento(ativo.kind)) return { error: "Investimento não encontrado." };
  if (d.valor > ativo.current) {
    return { fieldErrors: { valor: "Você não pode resgatar mais do que o valor atual." } };
  }

  const [destino] = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, d.contaDestinoId),
        eq(accounts.ledgerId, ledgerId),
        eq(accounts.isReimbursementPool, false),
        eq(accounts.isInvestmentPool, false),
      ),
    )
    .limit(1);
  if (!destino) return { fieldErrors: { contaDestinoId: "Conta inválida" } };

  await db.transaction(async (trx) => {
    const investimentosId = await garantirContaInvestimentos(trx, ledgerId, destino.currency);
    const par = crypto.randomUUID();
    const descricao = `Resgate: ${ativo.name}`;

    await trx.insert(transactions).values([
      {
        ledgerId, accountId: investimentosId, createdByUserId: userId, type: "transfer",
        status: "cleared", amount: -d.valor, currency: destino.currency, amountBase: -d.valor,
        description: descricao, date: d.date, settlementDate: d.date, transferPairId: par,
      },
      {
        ledgerId, accountId: destino.id, createdByUserId: userId, type: "transfer",
        status: "cleared", amount: d.valor, currency: destino.currency, amountBase: d.valor,
        description: descricao, date: d.date, settlementDate: d.date, transferPairId: par,
      },
    ]);

    // Baixa o ativo: o valor de mercado sai do currentValue; a base aportada cai
    // na mesma proporção resgatada.
    const fracaoRestante = ativo.current > 0 ? (ativo.current - d.valor) / ativo.current : 0;
    const novoInvestido = Math.max(0, Math.round(ativo.invested * fracaoRestante));
    const novoAtual = ativo.current - d.valor;
    await trx
      .update(assets)
      .set({ investedValue: novoInvestido, currentValue: novoAtual, updatedAt: new Date() })
      .where(eq(assets.id, ativo.id));

    // Snapshot do dia (um por dia; resgatar de novo no mesmo dia sobrescreve).
    const [snap] = await trx
      .select({ id: assetSnapshots.id })
      .from(assetSnapshots)
      .where(and(eq(assetSnapshots.assetId, ativo.id), eq(assetSnapshots.date, d.date)))
      .limit(1);
    if (snap) {
      await trx.update(assetSnapshots).set({ value: novoAtual }).where(eq(assetSnapshots.id, snap.id));
    } else {
      await trx.insert(assetSnapshots).values({ assetId: ativo.id, value: novoAtual, date: d.date });
    }
  });

  revalidatePath("/patrimonio");
  revalidatePath("/conciliacao");
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
