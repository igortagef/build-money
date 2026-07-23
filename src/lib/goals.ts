import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { goals, goalContributions } from "@/db/schema";
import { projetarMeta } from "./goals-calc";

/**
 * Metas: quanto já foi guardado, quanto falta, e se o ritmo atual chega lá.
 *
 * A projeção é deliberadamente conservadora: usa o ritmo REAL observado desde
 * o início da meta, não o ritmo necessário. Uma meta que promete "você
 * consegue!" sem base no comportamento da pessoa é só decoração.
 */

export type MetaComProgresso = Awaited<
  ReturnType<typeof getMetasComProgresso>
>[number];

export async function getMetasComProgresso(ledgerId: string) {
  const linhas = await db
    .select({
      id: goals.id,
      name: goals.name,
      description: goals.description,
      targetAmount: goals.targetAmount,
      currency: goals.currency,
      targetDate: goals.targetDate,
      startDate: goals.startDate,
      status: goals.status,
      achievedAt: goals.achievedAt,
      color: goals.color,
      icon: goals.icon,
      guardado: sql<number>`coalesce(sum(${goalContributions.amount}), 0)`.mapWith(
        Number,
      ),
      // Acumulado APÓS a data de início: exclui a semente (aporte inicial, que
      // fica datado no próprio startDate). É a base honesta do ritmo.
      guardadoDurante: sql<number>`coalesce(sum(${goalContributions.amount}) filter (where ${goalContributions.date} > ${goals.startDate}), 0)`.mapWith(
        Number,
      ),
      ultimoAporte: sql<string | null>`max(${goalContributions.date})`,
      qtdAportes: sql<number>`count(${goalContributions.id})`.mapWith(Number),
    })
    .from(goals)
    .leftJoin(goalContributions, eq(goalContributions.goalId, goals.id))
    .where(eq(goals.ledgerId, ledgerId))
    .groupBy(goals.id)
    .orderBy(asc(goals.status), desc(goals.createdAt));

  const hoje = new Date();

  return linhas.map((m) => {
    const proj = projetarMeta({
      guardado: m.guardado,
      guardadoDurante: m.guardadoDurante,
      targetAmount: m.targetAmount,
      startDate: m.startDate,
      targetDate: m.targetDate,
      hoje,
    });

    return {
      ...m,
      falta: proj.falta,
      percentual: proj.percentual,
      atingida: proj.atingida,
      previsao: proj.previsao,
      noRitmo: proj.noRitmo,
      precisaPorMes: proj.precisaPorMes,
      ritmoMensal: proj.ritmoMensal,
    };
  });
}

export async function getMeta(ledgerId: string, goalId: string) {
  const todas = await getMetasComProgresso(ledgerId);
  return todas.find((m) => m.id === goalId) ?? null;
}

export async function getAportes(goalId: string) {
  return db
    .select()
    .from(goalContributions)
    .where(eq(goalContributions.goalId, goalId))
    .orderBy(desc(goalContributions.date));
}

/** Soma guardada de uma meta, direto do banco. */
export async function getGuardado(goalId: string): Promise<number> {
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(${goalContributions.amount}), 0)`.mapWith(
        Number,
      ),
    })
    .from(goalContributions)
    .where(eq(goalContributions.goalId, goalId));
  return r?.total ?? 0;
}
