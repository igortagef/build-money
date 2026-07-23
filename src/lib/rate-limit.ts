import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";

/**
 * Trava de força bruta na autenticação.
 *
 * Sem isso, um atacante testa senhas indefinidamente — é o buraco mais óbvio de
 * qualquer app com login. A política conta as FALHAS recentes por identificador
 * (o e-mail tentado) numa janela deslizante e bloqueia quando passa do limite.
 *
 * Duas decisões deliberadas:
 *
 * 1. O contador vive no BANCO, não em memória. Em ambiente serverless cada
 *    requisição pode cair numa instância diferente, então contador em memória
 *    não protege nada.
 *
 * 2. A resposta ao usuário nunca revela se o e-mail existe. Bloqueio e senha
 *    errada devem ser indistinguíveis para quem está sondando contas.
 */

export type TipoTentativa = "login" | "reset" | "two_factor";

/** A partir daqui, bloqueia. */
const LIMITE_FALHAS = 5;
/** Janela de contagem e duração do bloqueio, em minutos. */
const JANELA_MIN = 15;

function minutosAtras(min: number): Date {
  return new Date(Date.now() - min * 60_000);
}

/** IP de quem chamou, atrás de proxy (Vercel/nginx põem o real no header). */
export async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

/** Registra a tentativa — sucesso ou falha — para alimentar a política. */
export async function registrarTentativa(
  identifier: string,
  kind: TipoTentativa,
  sucesso: boolean,
): Promise<void> {
  await db.insert(authAttempts).values({
    identifier: identifier.toLowerCase().trim(),
    kind,
    sucesso,
    ip: await ipDaRequisicao(),
  });
}

export type Bloqueio = { bloqueado: boolean; faltamSegundos: number };

/**
 * Diz se o identificador está bloqueado agora. Conta só as falhas depois da
 * última entrada bem-sucedida — assim, quem acerta a senha zera o contador e
 * não fica preso por erros antigos.
 */
export async function checarBloqueio(
  identifier: string,
  kind: TipoTentativa,
): Promise<Bloqueio> {
  const alvo = identifier.toLowerCase().trim();
  const desde = minutosAtras(JANELA_MIN);

  const recentes = await db
    .select({ sucesso: authAttempts.sucesso, createdAt: authAttempts.createdAt })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.identifier, alvo),
        eq(authAttempts.kind, kind),
        gte(authAttempts.createdAt, desde),
      ),
    )
    .orderBy(desc(authAttempts.createdAt))
    .limit(50);

  // Falhas acumuladas desde a última vez que entrou certo.
  const falhas: Date[] = [];
  for (const t of recentes) {
    if (t.sucesso) break;
    falhas.push(t.createdAt);
  }

  if (falhas.length < LIMITE_FALHAS) return { bloqueado: false, faltamSegundos: 0 };

  // O bloqueio corre a partir da falha mais recente.
  const liberaEm = new Date(falhas[0].getTime() + JANELA_MIN * 60_000);
  const faltam = Math.ceil((liberaEm.getTime() - Date.now()) / 1000);
  return faltam > 0
    ? { bloqueado: true, faltamSegundos: faltam }
    : { bloqueado: false, faltamSegundos: 0 };
}

/** Mensagem única para o usuário — não entrega se o e-mail existe ou não. */
export function mensagemBloqueio(b: Bloqueio): string {
  const min = Math.max(1, Math.ceil(b.faltamSegundos / 60));
  return `Muitas tentativas. Tente novamente em ${min} minuto${min > 1 ? "s" : ""}.`;
}

/** Limpeza das tentativas antigas (chamada oportunista, sem cron). */
export async function limparTentativasAntigas(): Promise<void> {
  await db.delete(authAttempts).where(sql`${authAttempts.createdAt} < now() - interval '1 day'`);
}
