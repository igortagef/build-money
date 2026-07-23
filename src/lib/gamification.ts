import "server-only";
import { and, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  transactions,
  transactionSplits,
  goals,
  userAchievements,
  userProgress,
  xpEvents,
} from "@/db/schema";
import { monthRange } from "./queries";
import {
  ACHIEVEMENT_BY_CODE,
  XP,
  type AchievementCode,
} from "./achievements";
import type { XpKind } from "@/db/schema";

/**
 * Motor da gamificação.
 *
 * Duas regras inegociáveis:
 *
 * 1. **Nunca pagar duas vezes pelo mesmo fato.** Toda concessão passa por
 *    `dedupeKey` com índice único. Recarregar a página, clicar duas vezes ou
 *    uma ação rodar de novo não geram XP extra.
 * 2. **Gamificação nunca derruba a operação.** Se o motor falhar, o
 *    lançamento do usuário tem que ser salvo mesmo assim — dinheiro é o
 *    dado real, XP é enfeite. Por isso as chamadas são embrulhadas em
 *    try/catch e o erro é registrado, não propagado.
 */

type Award = { kind: XpKind; dedupeKey: string; label?: string; amount?: number };

/** Data local em ISO (a ofensiva conta dias do usuário, não dias UTC). */
export function hojeISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/**
 * Concede XP se ainda não foi concedido para aquela chave.
 * Retorna quanto XP realmente entrou (0 se era repetido).
 */
async function concederXp(
  userId: string,
  ledgerId: string,
  awards: Award[],
): Promise<number> {
  if (awards.length === 0) return 0;

  const inseridos = await db
    .insert(xpEvents)
    .values(
      awards.map((a) => ({
        userId,
        ledgerId,
        kind: a.kind,
        amount: a.amount ?? XP[a.kind],
        dedupeKey: a.dedupeKey,
        label: a.label ?? null,
      })),
    )
    // O índice único (userId, dedupeKey) é o que garante a idempotência:
    // a segunda tentativa simplesmente não insere.
    .onConflictDoNothing({ target: [xpEvents.userId, xpEvents.dedupeKey] })
    .returning({ amount: xpEvents.amount });

  const ganho = inseridos.reduce((s, r) => s + r.amount, 0);
  if (ganho === 0) return 0;

  await db
    .insert(userProgress)
    .values({ userId, xp: ganho })
    .onConflictDoUpdate({
      target: userProgress.userId,
      set: {
        xp: sql`${userProgress.xp} + ${ganho}`,
        updatedAt: new Date(),
      },
    });

  return ganho;
}

/** Desbloqueia conquistas ainda não obtidas. Retorna as que abriram agora. */
async function desbloquear(
  userId: string,
  ledgerId: string,
  codes: AchievementCode[],
): Promise<AchievementCode[]> {
  if (codes.length === 0) return [];

  const novas = await db
    .insert(userAchievements)
    .values(codes.map((code) => ({ userId, ledgerId, code })))
    .onConflictDoNothing({
      target: [userAchievements.userId, userAchievements.code],
    })
    .returning({ code: userAchievements.code });

  if (novas.length === 0) return [];

  // O XP da conquista usa o próprio código como chave: nunca paga duas vezes.
  await concederXp(
    userId,
    ledgerId,
    novas.map((n) => {
      const def = ACHIEVEMENT_BY_CODE.get(n.code as AchievementCode)!;
      return {
        kind: "achievement" as const,
        dedupeKey: `achievement:${n.code}`,
        label: def.nome,
        amount: def.xp,
      };
    }),
  );

  return novas.map((n) => n.code as AchievementCode);
}

/**
 * Check-in diário. Chamado quando o usuário abre o app.
 * Mantém a ofensiva: dias consecutivos. Pular um dia zera.
 */
export async function checkInDiario(userId: string, ledgerId: string) {
  const hoje = hojeISO();

  const [atual] = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .limit(1);

  // Já fez check-in hoje: nada a fazer (e nada de XP de novo).
  if (atual?.lastCheckIn === hoje) return { jaFez: true, ofensiva: atual.currentStreak };

  let ofensiva = 1;
  if (atual?.lastCheckIn) {
    const dias = diasEntre(atual.lastCheckIn, hoje);
    // 1 dia = seguiu a sequência. Mais que isso, quebrou e recomeça.
    ofensiva = dias === 1 ? atual.currentStreak + 1 : 1;
  }

  const recorde = Math.max(ofensiva, atual?.longestStreak ?? 0);

  await db
    .insert(userProgress)
    .values({
      userId,
      lastCheckIn: hoje,
      currentStreak: ofensiva,
      longestStreak: recorde,
    })
    .onConflictDoUpdate({
      target: userProgress.userId,
      set: {
        lastCheckIn: hoje,
        currentStreak: ofensiva,
        longestStreak: recorde,
        updatedAt: new Date(),
      },
    });

  await concederXp(userId, ledgerId, [
    { kind: "daily_check_in", dedupeKey: `daily:${hoje}`, label: "Presença do dia" },
  ]);

  // Bônus a cada 7 dias de ofensiva, para a sequência ter valor crescente.
  if (ofensiva > 0 && ofensiva % 7 === 0) {
    await concederXp(userId, ledgerId, [
      {
        kind: "streak_bonus",
        dedupeKey: `streak:${userId}:${ofensiva}`,
        label: `${ofensiva} dias seguidos`,
      },
    ]);
  }

  const conquistas: AchievementCode[] = [];
  if (ofensiva >= 3) conquistas.push("ofensiva_3");
  if (ofensiva >= 7) conquistas.push("ofensiva_7");
  if (ofensiva >= 30) conquistas.push("ofensiva_30");

  const novas = await desbloquear(userId, ledgerId, conquistas);
  return { jaFez: false, ofensiva, novas };
}

/** Chamado depois de registrar um lançamento. */
export async function aoRegistrarLancamento(
  userId: string,
  ledgerId: string,
  transactionId: string,
  qtdRateios: number,
) {
  const rateado = qtdRateios > 1;

  await concederXp(userId, ledgerId, [
    {
      // A chave é o id do lançamento: reprocessar não paga de novo.
      kind: rateado ? "transaction_split" : "transaction_logged",
      dedupeKey: `tx:${transactionId}`,
      label: rateado ? "Lançamento rateado" : "Lançamento registrado",
    },
  ]);

  const [{ total }] = await db
    .select({ total: count() })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));

  const conquistas: AchievementCode[] = ["primeiro_lancamento"];
  if (total >= 10) conquistas.push("dez_lancamentos");
  if (total >= 100) conquistas.push("cem_lancamentos");
  if (rateado) conquistas.push("primeiro_rateio");
  if (qtdRateios >= 3) conquistas.push("rateio_tres_categorias");

  return desbloquear(userId, ledgerId, conquistas);
}

/** Chamado depois de cadastrar uma conta. */
export async function aoCadastrarConta(userId: string, ledgerId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(accounts)
    .where(eq(accounts.ledgerId, ledgerId));

  const conquistas: AchievementCode[] = ["primeira_conta"];
  if (total >= 3) conquistas.push("multi_conta");

  return desbloquear(userId, ledgerId, conquistas);
}

/**
 * Chamado ao conferir um lançamento com o extrato.
 * Verifica também se a conta e o mês inteiro ficaram conciliados.
 */
export async function aoConciliar(
  userId: string,
  ledgerId: string,
  transactionId: string,
  accountId: string,
  data: string,
) {
  await concederXp(userId, ledgerId, [
    {
      kind: "reconciled_transaction",
      dedupeKey: `rec:${transactionId}`,
      label: "Lançamento conferido",
    },
  ]);

  const conquistas: AchievementCode[] = ["primeira_conciliacao"];
  const referencia = new Date(`${data}T12:00:00`);
  const { start, end } = monthRange(referencia);

  // A conta ficou 100% conciliada no mês?
  const [contaPendente] = await db
    .select({ n: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        ne(transactions.status, "reconciled"),
        ne(transactions.status, "pending"),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    );

  if (contaPendente.n === 0) {
    conquistas.push("conta_conciliada");
    await concederXp(userId, ledgerId, [
      {
        kind: "account_reconciled",
        dedupeKey: `acct-rec:${accountId}:${start}`,
        label: "Conta conciliada no mês",
      },
    ]);

    // E o mês inteiro, em todas as contas?
    const [mesPendente] = await db
      .select({ n: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.ledgerId, ledgerId),
          ne(transactions.status, "reconciled"),
          ne(transactions.status, "pending"),
          gte(transactions.date, start),
          lte(transactions.date, end),
        ),
      );
    if (mesPendente.n === 0) conquistas.push("mes_conciliado");
  }

  return desbloquear(userId, ledgerId, conquistas);
}

/** Chamado ao criar ou concluir uma meta. */
export async function aoMexerEmMeta(
  userId: string,
  ledgerId: string,
  goalId: string,
  atingida: boolean,
) {
  await concederXp(userId, ledgerId, [
    { kind: "goal_created", dedupeKey: `goal:${goalId}`, label: "Meta criada" },
  ]);

  const conquistas: AchievementCode[] = ["primeira_meta"];

  if (atingida) {
    await concederXp(userId, ledgerId, [
      {
        kind: "goal_achieved",
        dedupeKey: `goal-done:${goalId}`,
        label: "Meta atingida",
      },
    ]);
    conquistas.push("meta_atingida");
  }

  return desbloquear(userId, ledgerId, conquistas);
}

/** Progresso completo para exibição. */
export async function getProgresso(userId: string) {
  const [p] = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .limit(1);

  return (
    p ?? {
      userId,
      xp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckIn: null,
      updatedAt: new Date(),
    }
  );
}

export async function getConquistas(userId: string) {
  return db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
}

/** Conquistas ainda não vistas, para o aviso de desbloqueio. */
export async function getConquistasNaoVistas(userId: string) {
  return db
    .select()
    .from(userAchievements)
    .where(
      and(
        eq(userAchievements.userId, userId),
        sql`${userAchievements.seenAt} is null`,
      ),
    );
}

export async function marcarConquistasVistas(userId: string) {
  await db
    .update(userAchievements)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(userAchievements.userId, userId),
        sql`${userAchievements.seenAt} is null`,
      ),
    );
}

export async function getHistoricoXp(userId: string, limite = 15) {
  return db
    .select()
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .orderBy(sql`${xpEvents.createdAt} desc`)
    .limit(limite);
}

/**
 * Embrulho para chamar o motor a partir de ações do usuário.
 * Gamificação quebrada não pode impedir alguém de registrar uma despesa.
 */
export async function semQuebrar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error("[gamificação] falhou, seguindo sem ela:", err);
    return null;
  }
}
