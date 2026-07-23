import "server-only";
import { randomBytes, createHash } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";

/**
 * Recuperação de senha por token.
 *
 * Decisões de segurança:
 *  - O token que vai no link é aleatório e longo. O que gravamos é o HASH dele
 *    (SHA-256). Vazamento do banco não permite trocar a senha de ninguém.
 *  - Uso único (`used_at`) e vida curta (30 min).
 *  - Ao pedir reset, a resposta é sempre a mesma, exista o e-mail ou não — não
 *    se entrega quais e-mails têm conta.
 *  - Trocar a senha invalida todas as sessões (via users.sessions_valid_from),
 *    derrubando quem porventura estivesse logado.
 */

const VALIDADE_MIN = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Cria um token para o e-mail, se ele existir. Retorna o token EM CLARO (só
 * aqui ele existe) para montar o link — ou null se o e-mail não tem conta.
 * O chamador nunca deve revelar ao usuário qual foi o caso.
 */
export async function criarTokenReset(email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  if (!user) return null;

  // Invalida tokens anteriores ainda válidos: um pedido novo aposenta os velhos.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VALIDADE_MIN * 60_000);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return token;
}

/** Confere se o token é válido AGORA (não usado, não expirado). */
export async function validarTokenReset(token: string): Promise<boolean> {
  if (!token) return false;
  const [t] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(t);
}

export type ResultadoReset = { ok: true; userId: string } | { ok: false; erro: string };

/**
 * Consome o token e troca a senha, numa transação. O `used_at is null` no
 * UPDATE do token é o que impede reuso mesmo em corrida. Ao final, todas as
 * sessões do usuário são invalidadas.
 */
export async function redefinirSenhaComToken(
  token: string,
  novoHash: string,
): Promise<ResultadoReset> {
  const hash = hashToken(token);

  return db.transaction(async (trx) => {
    // Marca o token como usado SÓ se ainda estava válido.
    const marcado = await trx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });

    if (marcado.length === 0) {
      return { ok: false, erro: "Este link é inválido ou já expirou." };
    }

    const userId = marcado[0].userId;
    await trx
      .update(users)
      .set({
        passwordHash: novoHash,
        // Derruba todas as sessões existentes.
        sessionsValidFrom: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { ok: true, userId };
  });
}

/** Limpeza oportunista de tokens vencidos. */
export async function limparTokensExpirados(): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < now() - interval '1 day'`);
}
