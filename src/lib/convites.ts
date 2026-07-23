import "server-only";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, users } from "@/db/schema";

/**
 * Convites (licenças) de acesso.
 *
 * O cadastro é fechado: só entra quem tem um código válido. Isso é o que
 * transforma um app publicado num subdomínio público em um beta controlado.
 *
 * Bootstrap: se ainda não há NENHUM usuário, o primeiro cadastro é liberado sem
 * código e vira administrador — do contrário não haveria quem emitisse o
 * primeiro convite.
 */

/** Código curto, legível e sem caracteres ambíguos (0/O, 1/I/l). */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function gerarCodigo(tamanho = 10): string {
  const bytes = randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i++) saida += ALFABETO[bytes[i]! % ALFABETO.length];
  // Formato BM-XXXXX-XXXXX: fácil de ditar por telefone/WhatsApp.
  return `BM-${saida.slice(0, 5)}-${saida.slice(5, 10)}`;
}

/** Ainda não existe ninguém? Então o primeiro cadastro é o do dono. */
export async function sistemaVazio(): Promise<boolean> {
  const [algum] = await db.select({ id: users.id }).from(users).limit(1);
  return !algum;
}

/**
 * Cadastro aberto (SEM convite). Existe por um motivo só: os testes automatizados
 * criam usuários descartáveis a cada execução.
 *
 * É opt-in EXPLÍCITO por variável de ambiente — nunca ligado por padrão, nunca
 * inferido de NODE_ENV. E quando está ligado, a tela de cadastro exibe um aviso
 * bem visível, para que ninguém publique assim sem perceber.
 *
 * Em produção: simplesmente não defina CADASTRO_ABERTO.
 */
export function cadastroAbertoPorConfig(): boolean {
  return process.env.CADASTRO_ABERTO === "1";
}

export type ResultadoConvite = { ok: boolean; erro?: string; inviteId?: string };

/** Valida o código sem consumi-lo (usado antes de criar o usuário). */
export async function validarConvite(codigo: string): Promise<ResultadoConvite> {
  const code = codigo.trim().toUpperCase();
  if (!code) return { ok: false, erro: "Informe o código do convite." };

  const [conv] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
  if (!conv) return { ok: false, erro: "Código de convite inválido." };
  if (conv.revokedAt) return { ok: false, erro: "Este convite foi cancelado." };
  if (conv.usedAt) return { ok: false, erro: "Este convite já foi utilizado." };
  return { ok: true, inviteId: conv.id };
}

/**
 * Consome o convite. A condição `used_at is null` vai no próprio UPDATE: se
 * duas pessoas usarem o mesmo código ao mesmo tempo, só uma consegue — o banco
 * decide, não a aplicação.
 */
export async function consumirConvite(inviteId: string, userId: string): Promise<boolean> {
  const marcados = await db
    .update(invites)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  return marcados.length > 0;
}

/** Cria um convite novo. */
export async function criarConvite(criadorId: string, nota?: string) {
  const [novo] = await db
    .insert(invites)
    .values({ code: gerarCodigo(), nota: nota?.trim() || null, createdByUserId: criadorId })
    .returning();
  return novo;
}

/** Lista os convites com o nome de quem usou. */
export async function listarConvites() {
  return db
    .select({
      id: invites.id,
      code: invites.code,
      nota: invites.nota,
      usedAt: invites.usedAt,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
      usadoPor: users.name,
      usadoPorEmail: users.email,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.usedByUserId))
    .orderBy(desc(invites.createdAt));
}

/** Cancela um convite ainda não usado. */
export async function revogarConvite(id: string): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, id), isNull(invites.usedAt)));
}

/** Quantas licenças já foram consumidas. */
export async function contarLicencas() {
  const [r] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      usadas: sql<number>`count(*) filter (where ${invites.usedAt} is not null)`.mapWith(Number),
    })
    .from(invites);
  return { total: r?.total ?? 0, usadas: r?.usadas ?? 0 };
}
